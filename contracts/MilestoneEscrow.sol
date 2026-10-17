// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MilestoneEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error DeadlineInPast();
    error NotBuyer();
    error NotSeller();
    error NotParty();
    error NotActive();
    error DeadlineNotPassed();

    enum Status {
        Active,
        Released,
        Refunded,
        Cancelled
    }

    struct Escrow {
        address buyer;
        address seller;
        address buyerPayout;
        address sellerPayout;
        uint256 amount;
        uint256 deadline;
        Status status;
        string description;
    }

    IERC20 public immutable usdc;

    uint256 public escrowCount;
    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint256 deadline,
        string description
    );
    event EscrowReleased(uint256 indexed escrowId, address indexed seller, uint256 amount);
    event EscrowRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);
    event EscrowCancelled(uint256 indexed escrowId, address indexed buyer, uint256 amount);
    event PayoutAddressUpdated(uint256 indexed escrowId, address indexed caller, address indexed newAddress);

    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    function createEscrow(
        address seller,
        uint256 amount,
        uint256 deadline,
        string calldata description
    ) external returns (uint256 escrowId) {
        if (seller == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlineInPast();

        // Balance-delta accounting: record actual received amount
        // (defends against any future fee-on-transfer token misconfiguration)
        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 actualReceived = usdc.balanceOf(address(this)) - balanceBefore;
        if (actualReceived == 0) revert ZeroAmount();

        escrowId = escrowCount++;
        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            seller: seller,
            buyerPayout: msg.sender,
            sellerPayout: seller,
            amount: actualReceived,
            deadline: deadline,
            status: Status.Active,
            description: description
        });

        emit EscrowCreated(escrowId, msg.sender, seller, actualReceived, deadline, description);
    }

    function setPayoutAddress(uint256 escrowId, bool isBuyer, address newAddress) external {
        Escrow storage escrow = escrows[escrowId];

        if (newAddress == address(0)) revert ZeroAddress();

        if (isBuyer) {
            if (msg.sender != escrow.buyer) revert NotParty();
            escrow.buyerPayout = newAddress;
        } else {
            if (msg.sender != escrow.seller) revert NotParty();
            escrow.sellerPayout = newAddress;
        }

        emit PayoutAddressUpdated(escrowId, msg.sender, newAddress);
    }

    function release(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];

        if (msg.sender != escrow.buyer) revert NotBuyer();
        if (escrow.status != Status.Active) revert NotActive();

        usdc.safeTransfer(escrow.sellerPayout, escrow.amount);
        escrow.status = Status.Released;

        emit EscrowReleased(escrowId, escrow.seller, escrow.amount);
    }

    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];

        if (msg.sender != escrow.buyer) revert NotBuyer();
        if (escrow.status != Status.Active) revert NotActive();
        if (block.timestamp <= escrow.deadline) revert DeadlineNotPassed();

        usdc.safeTransfer(escrow.buyerPayout, escrow.amount);
        escrow.status = Status.Refunded;

        emit EscrowRefunded(escrowId, escrow.buyer, escrow.amount);
    }

    function cancel(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];

        if (msg.sender != escrow.seller) revert NotSeller();
        if (escrow.status != Status.Active) revert NotActive();

        usdc.safeTransfer(escrow.buyerPayout, escrow.amount);
        escrow.status = Status.Cancelled;

        emit EscrowCancelled(escrowId, escrow.buyer, escrow.amount);
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }
}
