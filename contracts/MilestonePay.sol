// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MilestonePay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidMilestone();
    error NotSeller();
    error NotBuyer();
    error NotArbiter();
    error NotParty();
    error WrongStatus();
    error ReviewWindowNotPassed();
    error MismatchedArrays();
    error NoArbiter();
    error DeadlineInPast();
    error NoMilestones();
    error TooManyMilestones();
    error DisputeTimeoutNotReached();

    uint256 public constant MAX_MILESTONES = 20;

    enum EscrowStatus {
        Unfunded,
        Active,
        Completed,
        Cancelled
    }

    enum MilestoneStatus {
        Pending,
        Delivered,
        Released,
        Disputed,
        Resolved,
        Refunded
    }

    struct Milestone {
        string description;
        uint256 amount;
        MilestoneStatus status;
        uint64 deliveredAt;
        uint64 disputedAt;
        uint256 mutualSellerBps;
        bool mutualProposed;
    }

    struct Escrow {
        address seller;
        address buyer;
        address arbiter;
        uint256 deadline;
        uint64 reviewWindowSeconds;
        EscrowStatus status;
        Milestone[] milestones;
    }

    struct Reputation {
        uint256 completedCount;
        uint256 disputedCount;
    }

    IERC20 public immutable usdc;

    Escrow[] private _escrows;
    mapping(address => uint256[]) private _sellerEscrows;
    mapping(address => uint256[]) private _buyerEscrows;
    mapping(address => Reputation) private _reputations;
    mapping(address => uint256) public claimable;

    mapping(uint256 => bool) private _escrowSellerReputationDone;
    mapping(uint256 => bool) private _escrowBuyerDisputeDone;
    mapping(uint256 => bool) private _escrowSellerDisputeDone;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed seller,
        address indexed buyer,
        address arbiter,
        uint256 totalAmount
    );
    event EscrowFunded(uint256 indexed escrowId, address indexed buyer, uint256 totalAmount);
    event MilestoneDelivered(uint256 indexed escrowId, uint256 indexed milestoneIndex);
    event MilestoneApproved(uint256 indexed escrowId, uint256 indexed milestoneIndex, uint256 amount);
    event MilestoneDisputed(uint256 indexed escrowId, uint256 indexed milestoneIndex);
    event MilestoneAutoReleased(uint256 indexed escrowId, uint256 indexed milestoneIndex, uint256 amount);
    event DisputeResolved(
        uint256 indexed escrowId,
        uint256 indexed milestoneIndex,
        uint256 sellerAmount,
        uint256 buyerAmount
    );
    event MilestoneRefunded(uint256 indexed escrowId, uint256 indexed milestoneIndex, uint256 amount);
    event EscrowCancelled(uint256 indexed escrowId);
    event MutualResolutionProposed(uint256 indexed escrowId, uint256 indexed milestoneIndex, uint256 sellerBps);

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    function createEscrow(
        address buyer,
        address arbiter,
        uint256 reviewWindowSeconds,
        uint256 deadline,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts
    ) external returns (uint256 escrowId) {
        if (buyer == address(0)) revert ZeroAddress();
        if (milestoneDescriptions.length != milestoneAmounts.length) revert MismatchedArrays();
        if (milestoneDescriptions.length == 0) revert NoMilestones();
        if (milestoneDescriptions.length > MAX_MILESTONES) revert TooManyMilestones();
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (reviewWindowSeconds > type(uint64).max) revert WrongStatus();

        escrowId = _escrows.length;
        _escrows.push();

        Escrow storage escrow = _escrows[escrowId];
        escrow.seller = msg.sender;
        escrow.buyer = buyer;
        escrow.arbiter = arbiter;
        escrow.deadline = deadline;
        escrow.reviewWindowSeconds = uint64(reviewWindowSeconds);
        escrow.status = EscrowStatus.Unfunded;

        uint256 totalAmount;
        uint256 length = milestoneDescriptions.length;
        for (uint256 i = 0; i < length; ++i) {
            uint256 amount = milestoneAmounts[i];
            if (amount == 0) revert ZeroAmount();

            escrow.milestones.push(
                Milestone({
                    description: milestoneDescriptions[i],
                    amount: amount,
                    status: MilestoneStatus.Pending,
                    deliveredAt: 0,
                    disputedAt: 0,
                    mutualSellerBps: 0,
                    mutualProposed: false
                })
            );

            totalAmount += amount;
        }

        _sellerEscrows[msg.sender].push(escrowId);
        _buyerEscrows[buyer].push(escrowId);

        emit EscrowCreated(escrowId, msg.sender, buyer, arbiter, totalAmount);
    }

    function fundEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrowStorage(escrowId);

        if (msg.sender != escrow.buyer) revert NotBuyer();
        if (escrow.status != EscrowStatus.Unfunded) revert WrongStatus();

        uint256 totalAmount = _sumMilestones(escrow);

        escrow.status = EscrowStatus.Active;

        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), totalAmount);
        uint256 received = usdc.balanceOf(address(this)) - balanceBefore;
        if (received != totalAmount) revert WrongStatus();

        emit EscrowFunded(escrowId, msg.sender, totalAmount);
    }

    function cancelUnfundedEscrow(uint256 escrowId) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);

        if (msg.sender != escrow.seller) revert NotSeller();
        if (escrow.status != EscrowStatus.Unfunded) revert WrongStatus();

        escrow.status = EscrowStatus.Cancelled;

        emit EscrowCancelled(escrowId);
    }

    function deliverMilestone(uint256 escrowId, uint256 milestoneIndex) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);

        if (msg.sender != escrow.seller) revert NotSeller();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestone.status != MilestoneStatus.Pending) revert WrongStatus();

        milestone.status = MilestoneStatus.Delivered;
        milestone.deliveredAt = uint64(block.timestamp);

        emit MilestoneDelivered(escrowId, milestoneIndex);
    }

    function approveMilestone(uint256 escrowId, uint256 milestoneIndex) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);

        if (msg.sender != escrow.buyer) revert NotBuyer();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestone.status != MilestoneStatus.Delivered) revert WrongStatus();

        milestone.status = MilestoneStatus.Released;
        _recordSellerCompleted(escrowId, escrow.seller);
        _setEscrowCompletedIfFinalized(escrow);

        claimable[escrow.seller] += milestone.amount;

        emit MilestoneApproved(escrowId, milestoneIndex, milestone.amount);
    }

    function disputeMilestone(uint256 escrowId, uint256 milestoneIndex) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);

        if (msg.sender != escrow.buyer) revert NotBuyer();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestone.status != MilestoneStatus.Delivered) revert WrongStatus();

        uint256 reviewEnd = uint256(milestone.deliveredAt) + uint256(escrow.reviewWindowSeconds);
        if (block.timestamp > reviewEnd) revert WrongStatus();

        milestone.status = MilestoneStatus.Disputed;
        milestone.disputedAt = uint64(block.timestamp);
        _recordBuyerDispute(escrowId, escrow.buyer);

        emit MilestoneDisputed(escrowId, milestoneIndex);
    }

    function claimAutoRelease(uint256 escrowId, uint256 milestoneIndex) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);

        if (msg.sender != escrow.seller) revert NotSeller();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestone.status != MilestoneStatus.Delivered) revert WrongStatus();

        uint256 releaseAt = uint256(milestone.deliveredAt) + uint256(escrow.reviewWindowSeconds);
        if (block.timestamp <= releaseAt) revert ReviewWindowNotPassed();

        milestone.status = MilestoneStatus.Released;
        _recordSellerCompleted(escrowId, escrow.seller);
        _setEscrowCompletedIfFinalized(escrow);

        claimable[escrow.seller] += milestone.amount;

        emit MilestoneAutoReleased(escrowId, milestoneIndex, milestone.amount);
    }

    function resolveDispute(uint256 escrowId, uint256 milestoneIndex, uint256 sellerBps) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);

        if (escrow.arbiter == address(0)) revert NoArbiter();
        if (msg.sender != escrow.arbiter) revert NotArbiter();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestone.status != MilestoneStatus.Disputed) revert WrongStatus();

        _resolveMilestone(escrow, milestone, escrowId, milestoneIndex, sellerBps);
    }

    function proposeMutualResolution(uint256 escrowId, uint256 milestoneIndex, uint256 sellerBps) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);

        if (msg.sender != escrow.buyer) revert NotBuyer();
        if (escrow.arbiter != address(0)) revert WrongStatus();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestone.status != MilestoneStatus.Disputed) revert WrongStatus();
        if (sellerBps > 10_000) revert WrongStatus();

        milestone.mutualSellerBps = sellerBps;
        milestone.mutualProposed = true;

        emit MutualResolutionProposed(escrowId, milestoneIndex, sellerBps);
    }

    function acceptMutualResolution(uint256 escrowId, uint256 milestoneIndex) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);

        if (msg.sender != escrow.seller) revert NotSeller();
        if (escrow.arbiter != address(0)) revert WrongStatus();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestone.status != MilestoneStatus.Disputed) revert WrongStatus();
        if (!milestone.mutualProposed) revert WrongStatus();

        _resolveMilestone(escrow, milestone, escrowId, milestoneIndex, milestone.mutualSellerBps);
    }

    /// @notice Resolves a disputed milestone by timeout when no arbiter is set; seller or buyer may claim 100%.
    function resolveDisputeTimeout(uint256 escrowId, uint256 milestoneIndex) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);

        if (msg.sender != escrow.seller && msg.sender != escrow.buyer) revert NotParty();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (escrow.arbiter != address(0)) revert WrongStatus();
        if (milestone.status != MilestoneStatus.Disputed) revert WrongStatus();

        uint256 timeoutAt = uint256(milestone.disputedAt) + (uint256(escrow.reviewWindowSeconds) * 4);
        if (block.timestamp < timeoutAt) revert DisputeTimeoutNotReached();

        milestone.status = MilestoneStatus.Resolved;
        milestone.mutualSellerBps = 0;
        milestone.mutualProposed = false;

        if (msg.sender == escrow.seller) {
            _recordSellerCompleted(escrowId, escrow.seller);
            claimable[escrow.seller] += milestone.amount;

            emit DisputeResolved(escrowId, milestoneIndex, milestone.amount, 0);
        } else {
            _recordSellerDispute(escrowId, escrow.seller);
            claimable[escrow.buyer] += milestone.amount;

            emit DisputeResolved(escrowId, milestoneIndex, 0, milestone.amount);
        }

        _setEscrowCompletedIfFinalized(escrow);
    }

    function refundMilestone(uint256 escrowId, uint256 milestoneIndex) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);

        if (msg.sender != escrow.buyer) revert NotBuyer();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();

        if (milestone.status == MilestoneStatus.Pending) {
            // refundable anytime before delivery
        } else if (milestone.status == MilestoneStatus.Delivered) {
            if (block.timestamp <= escrow.deadline) revert WrongStatus();
        } else {
            revert WrongStatus();
        }

        milestone.status = MilestoneStatus.Refunded;
        _setEscrowCompletedIfFinalized(escrow);

        claimable[escrow.buyer] += milestone.amount;

        emit MilestoneRefunded(escrowId, milestoneIndex, milestone.amount);
    }

    function cancelActiveEscrow(uint256 escrowId) external {
        Escrow storage escrow = _getEscrowStorage(escrowId);

        if (msg.sender != escrow.seller) revert NotSeller();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();

        uint256 refundAmount;
        uint256 length = escrow.milestones.length;
        for (uint256 i = 0; i < length; ++i) {
            Milestone storage milestone = escrow.milestones[i];

            if (milestone.status == MilestoneStatus.Released || milestone.status == MilestoneStatus.Resolved) {
                revert WrongStatus();
            }

            if (
                milestone.status == MilestoneStatus.Pending || milestone.status == MilestoneStatus.Delivered
                    || milestone.status == MilestoneStatus.Disputed
            ) {
                milestone.status = MilestoneStatus.Refunded;
                refundAmount += milestone.amount;
            }
        }

        escrow.status = EscrowStatus.Cancelled;

        if (refundAmount > 0) {
            claimable[escrow.buyer] += refundAmount;
        }

        emit EscrowCancelled(escrowId);
    }

    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert ZeroAmount();

        claimable[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
    }

    function withdrawTo(address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();

        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert ZeroAmount();

        claimable[msg.sender] = 0;
        usdc.safeTransfer(to, amount);
    }

    function escrowCount() external view returns (uint256) {
        return _escrows.length;
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        return escrow;
    }

    function getMilestone(uint256 escrowId, uint256 milestoneIndex) external view returns (Milestone memory) {
        Escrow storage escrow = _getEscrowStorage(escrowId);
        Milestone storage milestone = _getMilestoneStorage(escrow, milestoneIndex);
        return milestone;
    }

    function getSellerEscrows(address seller) external view returns (uint256[] memory) {
        return _sellerEscrows[seller];
    }

    function getBuyerEscrows(address buyer) external view returns (uint256[] memory) {
        return _buyerEscrows[buyer];
    }

    function getReputation(address account) external view returns (uint256 completed, uint256 disputed) {
        Reputation storage rep = _reputations[account];
        return (rep.completedCount, rep.disputedCount);
    }

    function _resolveMilestone(
        Escrow storage escrow,
        Milestone storage milestone,
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 sellerBps
    ) internal {
        if (sellerBps > 10_000) revert WrongStatus();

        uint256 sellerAmount = (milestone.amount * sellerBps) / 10_000;
        uint256 buyerAmount = milestone.amount - sellerAmount;

        milestone.status = MilestoneStatus.Resolved;
        milestone.mutualSellerBps = 0;
        milestone.mutualProposed = false;

        if (sellerBps >= 5_000) {
            _recordSellerCompleted(escrowId, escrow.seller);
        } else {
            _recordSellerDispute(escrowId, escrow.seller);
        }

        _setEscrowCompletedIfFinalized(escrow);

        if (sellerAmount > 0) {
            claimable[escrow.seller] += sellerAmount;
        }
        if (buyerAmount > 0) {
            claimable[escrow.buyer] += buyerAmount;
        }

        emit DisputeResolved(escrowId, milestoneIndex, sellerAmount, buyerAmount);
    }

    function _recordSellerCompleted(uint256 escrowId, address seller) internal {
        if (!_escrowSellerReputationDone[escrowId]) {
            _escrowSellerReputationDone[escrowId] = true;
            _reputations[seller].completedCount += 1;
        }
    }

    function _recordBuyerDispute(uint256 escrowId, address buyer) internal {
        if (!_escrowBuyerDisputeDone[escrowId]) {
            _escrowBuyerDisputeDone[escrowId] = true;
            _reputations[buyer].disputedCount += 1;
        }
    }

    function _recordSellerDispute(uint256 escrowId, address seller) internal {
        if (!_escrowSellerDisputeDone[escrowId]) {
            _escrowSellerDisputeDone[escrowId] = true;
            _reputations[seller].disputedCount += 1;
        }
    }

    function _setEscrowCompletedIfFinalized(Escrow storage escrow) internal {
        if (escrow.status != EscrowStatus.Active) {
            return;
        }

        uint256 length = escrow.milestones.length;
        for (uint256 i = 0; i < length; ++i) {
            MilestoneStatus status = escrow.milestones[i].status;
            if (
                status != MilestoneStatus.Released && status != MilestoneStatus.Resolved
                    && status != MilestoneStatus.Refunded
            ) {
                return;
            }
        }

        escrow.status = EscrowStatus.Completed;
    }

    function _sumMilestones(Escrow storage escrow) internal view returns (uint256 total) {
        uint256 length = escrow.milestones.length;
        for (uint256 i = 0; i < length; ++i) {
            total += escrow.milestones[i].amount;
        }
    }

    function _getEscrowStorage(uint256 escrowId) internal view returns (Escrow storage escrow) {
        if (escrowId >= _escrows.length) revert WrongStatus();
        return _escrows[escrowId];
    }

    function _getMilestoneStorage(Escrow storage escrow, uint256 milestoneIndex)
        internal
        view
        returns (Milestone storage milestone)
    {
        if (milestoneIndex >= escrow.milestones.length) revert InvalidMilestone();
        return escrow.milestones[milestoneIndex];
    }
}
