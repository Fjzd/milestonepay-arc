// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MilestonePay} from "../MilestonePay.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

contract MilestonePayTest is Test {
    // ── Addresses ────────────────────────────────────────────────────────────
    address internal seller  = makeAddr("seller");
    address internal buyer   = makeAddr("buyer");
    address internal arbiter = makeAddr("arbiter");
    address internal alice   = makeAddr("alice");
    address internal bob     = makeAddr("bob");

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 internal constant REVIEW_WINDOW = 3 days;
    uint256 internal constant DEADLINE      = 30 days; // offset from block.timestamp

    // ── Contracts ────────────────────────────────────────────────────────────
    MockERC20    internal usdc;
    MilestonePay internal mp;

    // ── Default milestone arrays ──────────────────────────────────────────────
    string[]  internal descs;
    uint256[] internal amounts;

    // ─────────────────────────────────────────────────────────────────────────
    // setUp — runs before every test
    // ─────────────────────────────────────────────────────────────────────────
    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        mp   = new MilestonePay(address(usdc));

        // Default two-milestone config
        descs   = new string[](2);
        amounts = new uint256[](2);
        descs[0]   = "Design";
        descs[1]   = "Build";
        amounts[0] = 100e6;
        amounts[1] = 200e6;

        // Fund buyer with plenty of USDC and approve the contract
        usdc.mint(buyer, 10_000e6);
        vm.prank(buyer);
        usdc.approve(address(mp), type(uint256).max);

        // Also fund alice / bob for fuzz scenarios
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(mp), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// Creates a standard two-milestone escrow (with arbiter) from `seller`.
    function _createStdEscrow() internal returns (uint256 id) {
        vm.prank(seller);
        id = mp.createEscrow(
            buyer,
            arbiter,
            REVIEW_WINDOW,
            block.timestamp + DEADLINE,
            descs,
            amounts
        );
    }

    /// Creates a standard two-milestone escrow WITHOUT an arbiter.
    function _createNoArbiterEscrow() internal returns (uint256 id) {
        vm.prank(seller);
        id = mp.createEscrow(
            buyer,
            address(0),
            REVIEW_WINDOW,
            block.timestamp + DEADLINE,
            descs,
            amounts
        );
    }

    /// Creates and immediately funds a standard escrow (with arbiter).
    function _createAndFundEscrow() internal returns (uint256 id) {
        id = _createStdEscrow();
        vm.prank(buyer);
        mp.fundEscrow(id);
    }

    /// Creates and immediately funds a no-arbiter escrow.
    function _createAndFundNoArbiterEscrow() internal returns (uint256 id) {
        id = _createNoArbiterEscrow();
        vm.prank(buyer);
        mp.fundEscrow(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  CONSTRUCTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_Constructor_SetsUsdc() public view {
        assertEq(address(mp.usdc()), address(usdc));
    }

    function test_Constructor_RevertsZeroAddress() public {
        vm.expectRevert(MilestonePay.ZeroAddress.selector);
        new MilestonePay(address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  createEscrow — happy path
    // ═══════════════════════════════════════════════════════════════════════

    function test_CreateEscrow_HappyPath_UnfundedStatus() public {
        uint256 id = _createStdEscrow();
        MilestonePay.Escrow memory e = mp.getEscrow(id);
        assertEq(uint8(e.status), uint8(MilestonePay.EscrowStatus.Unfunded));
    }

    function test_CreateEscrow_HappyPath_Fields() public {
        uint256 deadline = block.timestamp + DEADLINE;
        vm.prank(seller);
        uint256 id = mp.createEscrow(buyer, arbiter, REVIEW_WINDOW, deadline, descs, amounts);

        MilestonePay.Escrow memory e = mp.getEscrow(id);
        assertEq(e.seller, seller);
        assertEq(e.buyer, buyer);
        assertEq(e.arbiter, arbiter);
        assertEq(e.deadline, deadline);
        assertEq(e.reviewWindowSeconds, REVIEW_WINDOW);
    }

    function test_CreateEscrow_HappyPath_Milestones() public {
        uint256 id = _createStdEscrow();
        MilestonePay.Milestone memory m0 = mp.getMilestone(id, 0);
        MilestonePay.Milestone memory m1 = mp.getMilestone(id, 1);
        assertEq(m0.amount, 100e6);
        assertEq(m1.amount, 200e6);
        assertEq(uint8(m0.status), uint8(MilestonePay.MilestoneStatus.Pending));
        assertEq(uint8(m1.status), uint8(MilestonePay.MilestoneStatus.Pending));
        assertEq(m0.description, "Design");
        assertEq(m1.description, "Build");
    }

    function test_CreateEscrow_ReturnsIdAndIncrementsCount() public {
        assertEq(mp.escrowCount(), 0);
        uint256 id0 = _createStdEscrow();
        assertEq(id0, 0);
        assertEq(mp.escrowCount(), 1);
        uint256 id1 = _createStdEscrow();
        assertEq(id1, 1);
        assertEq(mp.escrowCount(), 2);
    }

    function test_CreateEscrow_WorksWithNoArbiter() public {
        vm.prank(seller);
        uint256 id = mp.createEscrow(buyer, address(0), REVIEW_WINDOW, block.timestamp + DEADLINE, descs, amounts);
        MilestonePay.Escrow memory e = mp.getEscrow(id);
        assertEq(e.arbiter, address(0));
    }

    function test_CreateEscrow_EmitsEscrowCreated() public {
        uint256 totalAmount = amounts[0] + amounts[1]; // 300e6
        vm.prank(seller);
        vm.expectEmit(true, true, true, true, address(mp));
        emit MilestonePay.EscrowCreated(0, seller, buyer, arbiter, totalAmount);
        mp.createEscrow(buyer, arbiter, REVIEW_WINDOW, block.timestamp + DEADLINE, descs, amounts);
    }

    function test_CreateEscrow_GetSellerEscrows() public {
        uint256 id = _createStdEscrow();
        uint256[] memory ids = mp.getSellerEscrows(seller);
        assertEq(ids.length, 1);
        assertEq(ids[0], id);
    }

    function test_CreateEscrow_GetBuyerEscrows() public {
        uint256 id = _createStdEscrow();
        uint256[] memory ids = mp.getBuyerEscrows(buyer);
        assertEq(ids.length, 1);
        assertEq(ids[0], id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // createEscrow — revert paths
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateEscrow_RevertsZeroAddress_Buyer() public {
        vm.prank(seller);
        vm.expectRevert(MilestonePay.ZeroAddress.selector);
        mp.createEscrow(address(0), arbiter, REVIEW_WINDOW, block.timestamp + DEADLINE, descs, amounts);
    }

    function test_CreateEscrow_RevertsZeroAmount() public {
        amounts[1] = 0;
        vm.prank(seller);
        vm.expectRevert(MilestonePay.ZeroAmount.selector);
        mp.createEscrow(buyer, arbiter, REVIEW_WINDOW, block.timestamp + DEADLINE, descs, amounts);
    }

    function test_CreateEscrow_RevertsMismatchedArrays() public {
        string[] memory d = new string[](2);
        d[0] = "A"; d[1] = "B";
        uint256[] memory a = new uint256[](1);
        a[0] = 100e6;
        vm.prank(seller);
        vm.expectRevert(MilestonePay.MismatchedArrays.selector);
        mp.createEscrow(buyer, arbiter, REVIEW_WINDOW, block.timestamp + DEADLINE, d, a);
    }

    function test_CreateEscrow_RevertsNoMilestones() public {
        string[]  memory d = new string[](0);
        uint256[] memory a = new uint256[](0);
        vm.prank(seller);
        vm.expectRevert(MilestonePay.NoMilestones.selector);
        mp.createEscrow(buyer, arbiter, REVIEW_WINDOW, block.timestamp + DEADLINE, d, a);
    }

    function test_CreateEscrow_RevertsTooManyMilestones() public {
        uint256 n = 21;
        string[]  memory d = new string[](n);
        uint256[] memory a = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) { d[i] = "x"; a[i] = 1e6; }
        vm.prank(seller);
        vm.expectRevert(MilestonePay.TooManyMilestones.selector);
        mp.createEscrow(buyer, arbiter, REVIEW_WINDOW, block.timestamp + DEADLINE, d, a);
    }

    function test_CreateEscrow_RevertsDeadlineInPast() public {
        vm.prank(seller);
        vm.expectRevert(MilestonePay.DeadlineInPast.selector);
        mp.createEscrow(buyer, arbiter, REVIEW_WINDOW, block.timestamp, descs, amounts);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  fundEscrow
    // ═══════════════════════════════════════════════════════════════════════

    function test_FundEscrow_OnlyBuyer_PullsUsdc() public {
        uint256 id = _createStdEscrow();
        uint256 balBefore = usdc.balanceOf(buyer);
        vm.prank(buyer);
        mp.fundEscrow(id);
        uint256 transferred = balBefore - usdc.balanceOf(buyer);
        assertEq(transferred, amounts[0] + amounts[1]);
        assertEq(usdc.balanceOf(address(mp)), amounts[0] + amounts[1]);
    }

    function test_FundEscrow_StatusBecomesActive() public {
        uint256 id = _createAndFundEscrow();
        MilestonePay.Escrow memory e = mp.getEscrow(id);
        assertEq(uint8(e.status), uint8(MilestonePay.EscrowStatus.Active));
    }

    function test_FundEscrow_EmitsEscrowFunded() public {
        uint256 id = _createStdEscrow();
        uint256 total = amounts[0] + amounts[1];
        vm.prank(buyer);
        vm.expectEmit(true, true, false, true, address(mp));
        emit MilestonePay.EscrowFunded(id, buyer, total);
        mp.fundEscrow(id);
    }

    function test_FundEscrow_RevertsIfAlreadyActive() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(buyer);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.fundEscrow(id);
    }

    function test_FundEscrow_RevertsIfNotBuyer() public {
        uint256 id = _createStdEscrow();
        vm.prank(alice);
        vm.expectRevert(MilestonePay.NotBuyer.selector);
        mp.fundEscrow(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  cancelUnfundedEscrow
    // ═══════════════════════════════════════════════════════════════════════

    function test_CancelUnfunded_SellerCanCancel() public {
        uint256 id = _createStdEscrow();
        vm.prank(seller);
        mp.cancelUnfundedEscrow(id);
        MilestonePay.Escrow memory e = mp.getEscrow(id);
        assertEq(uint8(e.status), uint8(MilestonePay.EscrowStatus.Cancelled));
    }

    function test_CancelUnfunded_RevertsIfNotSeller() public {
        uint256 id = _createStdEscrow();
        vm.prank(buyer);
        vm.expectRevert(MilestonePay.NotSeller.selector);
        mp.cancelUnfundedEscrow(id);
    }

    function test_CancelUnfunded_RevertsIfActive() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.cancelUnfundedEscrow(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  deliverMilestone
    // ═══════════════════════════════════════════════════════════════════════

    function test_DeliverMilestone_SellerMarksDelivered() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller);
        mp.deliverMilestone(id, 0);
        MilestonePay.Milestone memory m = mp.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(MilestonePay.MilestoneStatus.Delivered));
        assertGt(m.deliveredAt, 0);
    }

    function test_DeliverMilestone_SetsDeliveredAt() public {
        uint256 id = _createAndFundEscrow();
        uint256 ts = block.timestamp;
        vm.prank(seller);
        mp.deliverMilestone(id, 0);
        MilestonePay.Milestone memory m = mp.getMilestone(id, 0);
        assertEq(m.deliveredAt, ts);
    }

    function test_DeliverMilestone_EmitsMilestoneDelivered() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller);
        vm.expectEmit(true, true, false, false, address(mp));
        emit MilestonePay.MilestoneDelivered(id, 0);
        mp.deliverMilestone(id, 0);
    }

    function test_DeliverMilestone_RevertsIfNotSeller() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(buyer);
        vm.expectRevert(MilestonePay.NotSeller.selector);
        mp.deliverMilestone(id, 0);
    }

    function test_DeliverMilestone_RevertsIfNotActive() public {
        uint256 id = _createStdEscrow(); // Unfunded
        vm.prank(seller);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.deliverMilestone(id, 0);
    }

    function test_DeliverMilestone_RevertsIfNotPending() public {
        uint256 id = _createAndFundEscrow();
        // Deliver once
        vm.prank(seller);
        mp.deliverMilestone(id, 0);
        // Attempt to deliver again
        vm.prank(seller);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.deliverMilestone(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  approveMilestone
    // ═══════════════════════════════════════════════════════════════════════

    function test_ApproveMilestone_BuyerApproves_ClaimableUpdated() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        uint256 claimableBefore = mp.claimable(seller);
        vm.prank(buyer);
        mp.approveMilestone(id, 0);
        assertEq(mp.claimable(seller), claimableBefore + amounts[0]);
    }

    function test_ApproveMilestone_StatusBecomesReleased() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer); mp.approveMilestone(id, 0);
        MilestonePay.Milestone memory m = mp.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(MilestonePay.MilestoneStatus.Released));
    }

    function test_ApproveMilestone_EmitsMilestoneApproved() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);
        vm.expectEmit(true, true, false, true, address(mp));
        emit MilestonePay.MilestoneApproved(id, 0, amounts[0]);
        mp.approveMilestone(id, 0);
    }

    function test_ApproveMilestone_RevertsIfNotBuyer() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(alice);
        vm.expectRevert(MilestonePay.NotBuyer.selector);
        mp.approveMilestone(id, 0);
    }

    function test_ApproveMilestone_RevertsIfNotDelivered() public {
        uint256 id = _createAndFundEscrow();
        // milestone 0 is still Pending
        vm.prank(buyer);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.approveMilestone(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  disputeMilestone
    // ═══════════════════════════════════════════════════════════════════════

    function test_DisputeMilestone_BuyerDisputes_StatusDisputed() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer); mp.disputeMilestone(id, 0);
        MilestonePay.Milestone memory m = mp.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(MilestonePay.MilestoneStatus.Disputed));
        assertGt(m.disputedAt, 0);
    }

    function test_DisputeMilestone_SetsDisputedAt() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        uint256 ts = block.timestamp;
        vm.prank(buyer); mp.disputeMilestone(id, 0);
        MilestonePay.Milestone memory m = mp.getMilestone(id, 0);
        assertEq(m.disputedAt, ts);
    }

    function test_DisputeMilestone_EmitsMilestoneDisputed() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);
        vm.expectEmit(true, true, false, false, address(mp));
        emit MilestonePay.MilestoneDisputed(id, 0);
        mp.disputeMilestone(id, 0);
    }

    function test_DisputeMilestone_RevertsIfNotBuyer() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(alice);
        vm.expectRevert(MilestonePay.NotBuyer.selector);
        mp.disputeMilestone(id, 0);
    }

    function test_DisputeMilestone_RevertsIfNotDelivered() public {
        uint256 id = _createAndFundEscrow();
        // milestone is Pending
        vm.prank(buyer);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.disputeMilestone(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  claimAutoRelease
    // ═══════════════════════════════════════════════════════════════════════

    function test_ClaimAutoRelease_SellerClaimsAfterWindow() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        // Advance past review window
        skip(REVIEW_WINDOW + 1);
        vm.prank(seller); mp.claimAutoRelease(id, 0);
        assertEq(mp.claimable(seller), amounts[0]);
    }

    function test_ClaimAutoRelease_ClaimableBalanceUpdated() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        skip(REVIEW_WINDOW + 1);
        vm.prank(seller); mp.claimAutoRelease(id, 0);
        MilestonePay.Milestone memory m = mp.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(MilestonePay.MilestoneStatus.Released));
        assertEq(mp.claimable(seller), amounts[0]);
    }

    function test_ClaimAutoRelease_EmitsMilestoneAutoReleased() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        skip(REVIEW_WINDOW + 1);
        vm.prank(seller);
        vm.expectEmit(true, true, false, true, address(mp));
        emit MilestonePay.MilestoneAutoReleased(id, 0, amounts[0]);
        mp.claimAutoRelease(id, 0);
    }

    function test_ClaimAutoRelease_RevertsIfWindowNotPassed() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        // Do NOT advance time
        vm.prank(seller);
        vm.expectRevert(MilestonePay.ReviewWindowNotPassed.selector);
        mp.claimAutoRelease(id, 0);
    }

    function test_ClaimAutoRelease_RevertsIfNotDelivered() public {
        uint256 id = _createAndFundEscrow();
        // milestone is Pending, not Delivered
        skip(REVIEW_WINDOW + 1);
        vm.prank(seller);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.claimAutoRelease(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  withdraw / withdrawTo
    // ═══════════════════════════════════════════════════════════════════════

    function _setupApprovedMilestone() internal returns (uint256 id) {
        id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer); mp.approveMilestone(id, 0);
        // seller.claimable == 100e6
    }

    function test_Withdraw_UserReceivesBalance() public {
        _setupApprovedMilestone();
        uint256 balBefore = usdc.balanceOf(seller);
        vm.prank(seller);
        mp.withdraw();
        assertEq(usdc.balanceOf(seller), balBefore + amounts[0]);
    }

    function test_Withdraw_ClaimableZeroedAfter() public {
        _setupApprovedMilestone();
        vm.prank(seller); mp.withdraw();
        assertEq(mp.claimable(seller), 0);
    }

    function test_Withdraw_RevertsIfClaimableZero() public {
        vm.prank(alice);
        vm.expectRevert(MilestonePay.ZeroAmount.selector);
        mp.withdraw();
    }

    function test_WithdrawTo_SendsToDifferentAddress() public {
        _setupApprovedMilestone();
        uint256 balBefore = usdc.balanceOf(bob);
        vm.prank(seller);
        mp.withdrawTo(bob);
        assertEq(usdc.balanceOf(bob), balBefore + amounts[0]);
        assertEq(mp.claimable(seller), 0);
    }

    function test_WithdrawTo_RevertsIfZeroAddress() public {
        _setupApprovedMilestone();
        vm.prank(seller);
        vm.expectRevert(MilestonePay.ZeroAddress.selector);
        mp.withdrawTo(address(0));
    }

    function test_WithdrawTo_RevertsIfClaimableZero() public {
        vm.prank(alice);
        vm.expectRevert(MilestonePay.ZeroAmount.selector);
        mp.withdrawTo(bob);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  resolveDispute (arbiter path)
    // ═══════════════════════════════════════════════════════════════════════

    function _setupDisputedMilestone() internal returns (uint256 id) {
        id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.disputeMilestone(id, 0);
    }

    function test_ResolveDispute_Arbiter_FullSeller() public {
        uint256 id = _setupDisputedMilestone();
        vm.prank(arbiter);
        mp.resolveDispute(id, 0, 10_000); // 100% seller
        assertEq(mp.claimable(seller), amounts[0]);
        assertEq(mp.claimable(buyer),  0);
    }

    function test_ResolveDispute_Arbiter_FullBuyer() public {
        uint256 id = _setupDisputedMilestone();
        vm.prank(arbiter);
        mp.resolveDispute(id, 0, 0); // 0% seller
        assertEq(mp.claimable(seller), 0);
        assertEq(mp.claimable(buyer),  amounts[0]);
    }

    function test_ResolveDispute_Arbiter_Split5050() public {
        uint256 id = _setupDisputedMilestone();
        vm.prank(arbiter);
        mp.resolveDispute(id, 0, 5_000);
        uint256 expectedSeller = (amounts[0] * 5_000) / 10_000;
        uint256 expectedBuyer  = amounts[0] - expectedSeller;
        assertEq(mp.claimable(seller), expectedSeller);
        assertEq(mp.claimable(buyer),  expectedBuyer);
    }

    function test_ResolveDispute_EmitsDisputeResolved() public {
        uint256 id = _setupDisputedMilestone();
        uint256 sellerAmt = (amounts[0] * 7_000) / 10_000;
        uint256 buyerAmt  = amounts[0] - sellerAmt;
        vm.prank(arbiter);
        vm.expectEmit(true, true, false, true, address(mp));
        emit MilestonePay.DisputeResolved(id, 0, sellerAmt, buyerAmt);
        mp.resolveDispute(id, 0, 7_000);
    }

    function test_ResolveDispute_RevertsIfNoArbiter() public {
        uint256 id = _createAndFundNoArbiterEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        // dispute with review window open
        vm.prank(buyer); mp.disputeMilestone(id, 0);
        vm.prank(alice);
        vm.expectRevert(MilestonePay.NoArbiter.selector);
        mp.resolveDispute(id, 0, 5_000);
    }

    function test_ResolveDispute_RevertsIfNotArbiter() public {
        uint256 id = _setupDisputedMilestone();
        vm.prank(alice);
        vm.expectRevert(MilestonePay.NotArbiter.selector);
        mp.resolveDispute(id, 0, 5_000);
    }

    function test_ResolveDispute_RevertsIfNotDisputed() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        // milestone is Delivered, not Disputed
        vm.prank(arbiter);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.resolveDispute(id, 0, 5_000);
    }

    function test_ResolveDispute_CorrectAmounts() public {
        uint256 id = _setupDisputedMilestone();
        uint256 bps = 3_000;
        vm.prank(arbiter);
        mp.resolveDispute(id, 0, bps);
        uint256 expectedSeller = (amounts[0] * bps) / 10_000;
        uint256 expectedBuyer  = amounts[0] - expectedSeller;
        assertEq(mp.claimable(seller), expectedSeller);
        assertEq(mp.claimable(buyer),  expectedBuyer);
        // no leakage
        assertEq(expectedSeller + expectedBuyer, amounts[0]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  proposeMutualResolution + acceptMutualResolution
    // ═══════════════════════════════════════════════════════════════════════

    function _setupNoArbiterDisputedMilestone() internal returns (uint256 id) {
        id = _createAndFundNoArbiterEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.disputeMilestone(id, 0);
    }

    function test_MutualResolution_BuyerProposeSellerAccepts() public {
        uint256 id = _setupNoArbiterDisputedMilestone();
        uint256 bps = 6_000;
        vm.prank(buyer); mp.proposeMutualResolution(id, 0, bps);
        vm.prank(seller); mp.acceptMutualResolution(id, 0);
        uint256 expectedSeller = (amounts[0] * bps) / 10_000;
        uint256 expectedBuyer  = amounts[0] - expectedSeller;
        assertEq(mp.claimable(seller), expectedSeller);
        assertEq(mp.claimable(buyer),  expectedBuyer);
    }

    function test_MutualResolution_EmitsDisputeResolved() public {
        uint256 id = _setupNoArbiterDisputedMilestone();
        uint256 bps = 5_000;
        uint256 sellerAmt = (amounts[0] * bps) / 10_000;
        uint256 buyerAmt  = amounts[0] - sellerAmt;
        vm.prank(buyer); mp.proposeMutualResolution(id, 0, bps);
        vm.prank(seller);
        vm.expectEmit(true, true, false, true, address(mp));
        emit MilestonePay.DisputeResolved(id, 0, sellerAmt, buyerAmt);
        mp.acceptMutualResolution(id, 0);
    }

    function test_MutualResolution_RevertsIfNoPendingProposal() public {
        uint256 id = _setupNoArbiterDisputedMilestone();
        vm.prank(seller);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.acceptMutualResolution(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  resolveDisputeTimeout (no-arbiter timeout path)
    // ═══════════════════════════════════════════════════════════════════════

    function test_ResolveDisputeTimeout_SellerClaims100AfterTimeout() public {
        uint256 id = _setupNoArbiterDisputedMilestone();
        MilestonePay.Milestone memory m0 = mp.getMilestone(id, 0);
        uint256 timeoutAt = uint256(m0.disputedAt) + (REVIEW_WINDOW * 4);
        vm.warp(timeoutAt); // exactly at timeout (block.timestamp < timeoutAt fails, >= passes)
        vm.prank(seller);
        mp.resolveDisputeTimeout(id, 0);
        assertEq(mp.claimable(seller), amounts[0]);
        assertEq(mp.claimable(buyer),  0);
    }

    function test_ResolveDisputeTimeout_BuyerClaims100AfterTimeout() public {
        uint256 id = _setupNoArbiterDisputedMilestone();
        MilestonePay.Milestone memory m0 = mp.getMilestone(id, 0);
        uint256 timeoutAt = uint256(m0.disputedAt) + (REVIEW_WINDOW * 4);
        vm.warp(timeoutAt);
        vm.prank(buyer);
        mp.resolveDisputeTimeout(id, 0);
        assertEq(mp.claimable(buyer), amounts[0]);
        assertEq(mp.claimable(seller), 0);
    }

    function test_ResolveDisputeTimeout_RevertsIfTimeoutNotReached() public {
        uint256 id = _setupNoArbiterDisputedMilestone();
        // Do not advance time
        vm.prank(seller);
        vm.expectRevert(MilestonePay.DisputeTimeoutNotReached.selector);
        mp.resolveDisputeTimeout(id, 0);
    }

    function test_ResolveDisputeTimeout_RevertsIfArbiterIsSet() public {
        // Use escrow WITH arbiter
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.disputeMilestone(id, 0);
        MilestonePay.Milestone memory m0 = mp.getMilestone(id, 0);
        uint256 timeoutAt = uint256(m0.disputedAt) + (REVIEW_WINDOW * 4);
        vm.warp(timeoutAt);
        vm.prank(seller);
        vm.expectRevert(MilestonePay.WrongStatus.selector); // reverts because arbiter != address(0)
        mp.resolveDisputeTimeout(id, 0);
    }

    function test_ResolveDisputeTimeout_RevertsIfNotDisputed() public {
        uint256 id = _createAndFundNoArbiterEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        // milestone is Delivered, not Disputed
        skip(REVIEW_WINDOW * 5);
        vm.prank(seller);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.resolveDisputeTimeout(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  refundMilestone
    // ═══════════════════════════════════════════════════════════════════════

    function test_RefundMilestone_BuyerRefundsPending() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(buyer);
        mp.refundMilestone(id, 0);
        assertEq(mp.claimable(buyer), amounts[0]);
        MilestonePay.Milestone memory m = mp.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(MilestonePay.MilestoneStatus.Refunded));
    }

    function test_RefundMilestone_BuyerRefundsDeliveredAfterDeadline() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        // Warp past the deadline
        MilestonePay.Escrow memory e = mp.getEscrow(id);
        vm.warp(e.deadline + 1);
        vm.prank(buyer); mp.refundMilestone(id, 0);
        assertEq(mp.claimable(buyer), amounts[0]);
    }

    function test_RefundMilestone_RevertsIfReleased() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.approveMilestone(id, 0);
        // now Released
        vm.prank(buyer);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.refundMilestone(id, 0);
    }

    function test_RefundMilestone_CannotRefundDeliveredBeforeDeadline() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        // deadline is 30 days away — do not advance
        vm.prank(buyer);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.refundMilestone(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  cancelActiveEscrow
    // ═══════════════════════════════════════════════════════════════════════

    function test_CancelActiveEscrow_SellerCancels_AllMilestonesRefunded() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller);
        mp.cancelActiveEscrow(id);
        MilestonePay.Escrow memory e = mp.getEscrow(id);
        assertEq(uint8(e.status), uint8(MilestonePay.EscrowStatus.Cancelled));
        assertEq(mp.claimable(buyer), amounts[0] + amounts[1]);
    }

    function test_CancelActiveEscrow_EmitsEscrowCancelled() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller);
        vm.expectEmit(true, false, false, false, address(mp));
        emit MilestonePay.EscrowCancelled(id);
        mp.cancelActiveEscrow(id);
    }

    function test_CancelActiveEscrow_RevertsIfMilestoneReleased() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.approveMilestone(id, 0);
        vm.prank(seller);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.cancelActiveEscrow(id);
    }

    function test_CancelActiveEscrow_RevertsIfNotSeller() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(buyer);
        vm.expectRevert(MilestonePay.NotSeller.selector);
        mp.cancelActiveEscrow(id);
    }

    function test_CancelActiveEscrow_RevertsIfNotActive() public {
        uint256 id = _createStdEscrow(); // Unfunded
        vm.prank(seller);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.cancelActiveEscrow(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  Reputation
    // ═══════════════════════════════════════════════════════════════════════

    function test_Reputation_CompletedCount_IncrementOnFirstRelease() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.approveMilestone(id, 0);
        (uint256 completed,) = mp.getReputation(seller);
        assertEq(completed, 1);
    }

    function test_Reputation_CompletedCount_NoDoubleCount_SecondMilestone() public {
        uint256 id = _createAndFundEscrow();
        // Release milestone 0
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.approveMilestone(id, 0);
        // Release milestone 1
        vm.prank(seller); mp.deliverMilestone(id, 1);
        vm.prank(buyer);  mp.approveMilestone(id, 1);
        (uint256 completed,) = mp.getReputation(seller);
        assertEq(completed, 1, "completedCount should be 1, not 2, for the same escrow");
    }

    function test_Reputation_DisputedCount_BuyerIncrement() public {
        uint256 id = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.disputeMilestone(id, 0);
        (, uint256 buyerDisputed) = mp.getReputation(buyer);
        assertEq(buyerDisputed, 1);
    }

    function test_Reputation_DisputedCount_NoBuyerDoubleCount() public {
        uint256 id = _createAndFundEscrow();
        // Dispute milestone 0
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.disputeMilestone(id, 0);
        // Resolve it, then dispute milestone 1
        vm.prank(arbiter); mp.resolveDispute(id, 0, 5_000);
        vm.prank(seller); mp.deliverMilestone(id, 1);
        vm.prank(buyer);  mp.disputeMilestone(id, 1);
        (, uint256 buyerDisputed) = mp.getReputation(buyer);
        assertEq(buyerDisputed, 1, "buyerDisputed should be 1, not 2, for the same escrow");
    }

    function test_Reputation_SellerDisputedCount_WhenSellerLoses() public {
        uint256 id = _setupDisputedMilestone();
        // sellerBps < 5000 → seller loses → seller disputedCount++
        vm.prank(arbiter); mp.resolveDispute(id, 0, 3_000);
        (, uint256 sellerDisputed) = mp.getReputation(seller);
        assertEq(sellerDisputed, 1);
    }

    function test_Reputation_SellerCompletedCount_WhenSellerWins() public {
        uint256 id = _setupDisputedMilestone();
        // sellerBps >= 5000 → seller wins → completedCount++
        vm.prank(arbiter); mp.resolveDispute(id, 0, 8_000);
        (uint256 completed,) = mp.getReputation(seller);
        assertEq(completed, 1);
    }

    function test_Reputation_GetReputation_ReturnsCorrectValues() public {
        // Seller completes two separate escrows → completedCount == 2
        uint256 id0 = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id0, 0);
        vm.prank(buyer);  mp.approveMilestone(id0, 0);

        uint256 id1 = _createAndFundEscrow();
        vm.prank(seller); mp.deliverMilestone(id1, 0);
        vm.prank(buyer);  mp.approveMilestone(id1, 0);

        (uint256 completed, uint256 disputed) = mp.getReputation(seller);
        assertEq(completed, 2);
        assertEq(disputed,  0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  Multi-milestone E2E sequence
    //     Reproduces the full e2e-sim flow entirely in Foundry so ordering
    //     and timing bugs are caught before a live testnet run.
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev 3 milestones:
    ///   0 – deliver → buyer approves → seller withdraws
    ///   1 – deliver (leave for auto-release, do NOT approve yet)
    ///   2 – deliver → buyer disputes WITHIN review window
    ///         → arbiter resolves 60 / 40 → both parties withdraw
    ///   then: advance past review window → auto-release m1 → seller withdraws
    function test_E2E_ThreeMilestone_DeliverDisputeArbiterAutoRelease() public {
        // ── Setup ─────────────────────────────────────────────────────────────
        uint256 WINDOW = 1 hours;
        string[]  memory d = new string[](3);
        uint256[] memory a = new uint256[](3);
        d[0] = "Design"; d[1] = "Frontend"; d[2] = "Delivery";
        a[0] = 100e6;    a[1] = 100e6;      a[2] = 100e6;

        vm.prank(seller);
        uint256 id = mp.createEscrow(
            buyer, arbiter, WINDOW, block.timestamp + DEADLINE, d, a
        );
        vm.prank(buyer);
        mp.fundEscrow(id);

        // ── Milestone 0: deliver → approve → withdraw ─────────────────────────
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.approveMilestone(id, 0);
        assertEq(mp.claimable(seller), 100e6, "m0: claimable after approve");

        uint256 balBefore = usdc.balanceOf(seller);
        vm.prank(seller); mp.withdraw();
        assertEq(usdc.balanceOf(seller), balBefore + 100e6, "m0: seller received");
        assertEq(mp.claimable(seller), 0, "m0: claimable zeroed");

        // ── Milestone 1: deliver only — left in Delivered for auto-release ────
        //    (must be delivered BEFORE the auto-release wait, so the timestamp
        //     used in releaseAt = deliveredAt + window is set correctly)
        vm.prank(seller); mp.deliverMilestone(id, 1);

        // ── Milestone 2: deliver → dispute within window → arbiter 60/40 ─────
        vm.prank(seller); mp.deliverMilestone(id, 2);
        // dispute must happen BEFORE the review window expires
        vm.prank(buyer);  mp.disputeMilestone(id, 2);

        {
            MilestonePay.Milestone memory m2 = mp.getMilestone(id, 2);
            assertEq(uint8(m2.status), uint8(MilestonePay.MilestoneStatus.Disputed), "m2: Disputed");
        }

        // arbiter resolves 60% to seller, 40% to buyer
        vm.prank(arbiter); mp.resolveDispute(id, 2, 6_000);

        uint256 expectedSellerSplit = (100e6 * 6_000) / 10_000; // 60e6
        uint256 expectedBuyerSplit  = 100e6 - expectedSellerSplit; // 40e6
        assertEq(mp.claimable(seller), expectedSellerSplit, "m2: seller split");
        assertEq(mp.claimable(buyer),  expectedBuyerSplit,  "m2: buyer split");

        // both parties withdraw their dispute proceeds
        uint256 sellerBalBefore = usdc.balanceOf(seller);
        uint256 buyerBalBefore  = usdc.balanceOf(buyer);
        vm.prank(seller); mp.withdraw();
        vm.prank(buyer);  mp.withdraw();
        assertEq(usdc.balanceOf(seller), sellerBalBefore + expectedSellerSplit, "m2: seller USDC");
        assertEq(usdc.balanceOf(buyer),  buyerBalBefore  + expectedBuyerSplit,  "m2: buyer USDC");

        // ── Milestone 1: advance past review window → auto-release ────────────
        skip(WINDOW + 1);
        vm.prank(seller); mp.claimAutoRelease(id, 1);
        assertEq(mp.claimable(seller), 100e6, "m1: auto-released claimable");

        uint256 sellerFinalBal = usdc.balanceOf(seller);
        vm.prank(seller); mp.withdraw();
        assertEq(usdc.balanceOf(seller), sellerFinalBal + 100e6, "m1: auto-release USDC");
        assertEq(mp.claimable(seller), 0, "m1: claimable zeroed");

        // ── Escrow should be Completed once all milestones are finalized ──────
        {
            MilestonePay.Escrow memory e = mp.getEscrow(id);
            assertEq(uint8(e.status), uint8(MilestonePay.EscrowStatus.Completed), "escrow Completed");
        }

        // ── Reputation ────────────────────────────────────────────────────────
        (uint256 sellerCompleted, uint256 sellerDisputed) = mp.getReputation(seller);
        (, uint256 buyerDisputed) = mp.getReputation(buyer);
        // m0 approved → completedCount = 1; m2 resolved with 60% to seller → completedCount stays 1
        assertEq(sellerCompleted, 1, "seller completedCount");
        // m2 resolved < 50% seller means sellerDisputed=1, but 60% >= 5000 bps so completedCount only
        assertEq(sellerDisputed,  0, "seller disputedCount (60% win)");
        assertEq(buyerDisputed,   1, "buyer disputedCount");
    }

    /// @dev Confirms disputeMilestone reverts when called AFTER the review window
    ///      (the timing trap the e2e script fell into).
    function test_DisputeMilestone_RevertsAfterReviewWindowExpires() public {
        uint256 WINDOW = 1 hours;
        string[]  memory d = new string[](1); d[0] = "Work";
        uint256[] memory a = new uint256[](1); a[0] = 100e6;
        vm.prank(seller);
        uint256 id = mp.createEscrow(buyer, arbiter, WINDOW, block.timestamp + DEADLINE, d, a);
        vm.prank(buyer); mp.fundEscrow(id);
        vm.prank(seller); mp.deliverMilestone(id, 0);

        // advance past review window
        skip(WINDOW + 1);

        vm.prank(buyer);
        vm.expectRevert(MilestonePay.WrongStatus.selector);
        mp.disputeMilestone(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░  Fuzz Tests
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Fuzz milestone amounts: deposited == sum; claimable after approve == sum.
    function testFuzz_TotalDepositedEqualsMilestoneSum(uint256 a0, uint256 a1) public {
        // Bound to reasonable USDC amounts (1 – 1000 USDC each, 6 decimals)
        a0 = bound(a0, 1e6, 1_000e6);
        a1 = bound(a1, 1e6, 1_000e6);
        uint256 total = a0 + a1;

        // Mint enough for buyer
        usdc.mint(buyer, total);

        string[] memory d = new string[](2);
        d[0] = "X"; d[1] = "Y";
        uint256[] memory a = new uint256[](2);
        a[0] = a0; a[1] = a1;

        vm.prank(seller);
        uint256 id = mp.createEscrow(buyer, arbiter, REVIEW_WINDOW, block.timestamp + DEADLINE, d, a);

        uint256 contractBalBefore = usdc.balanceOf(address(mp));
        uint256 buyerBalBefore    = usdc.balanceOf(buyer);

        vm.prank(buyer);
        mp.fundEscrow(id);

        // Exact amount pulled from buyer
        assertEq(usdc.balanceOf(buyer),       buyerBalBefore    - total);
        assertEq(usdc.balanceOf(address(mp)), contractBalBefore + total);

        // Approve both milestones → claimable == total
        vm.prank(seller); mp.deliverMilestone(id, 0);
        vm.prank(buyer);  mp.approveMilestone(id, 0);
        vm.prank(seller); mp.deliverMilestone(id, 1);
        vm.prank(buyer);  mp.approveMilestone(id, 1);

        assertEq(mp.claimable(seller), total);
    }

    /// @dev Fuzz sellerBps: sellerAmount + buyerAmount == milestoneAmount (no leakage).
    function testFuzz_ResolveDispute_NoLeakage(uint256 bps) public {
        bps = bound(bps, 0, 10_000);

        uint256 milestoneAmt = amounts[0]; // 100e6

        uint256 id = _setupDisputedMilestone();

        vm.prank(arbiter);
        mp.resolveDispute(id, 0, bps);

        uint256 sellerGot = mp.claimable(seller);
        uint256 buyerGot  = mp.claimable(buyer);

        assertEq(sellerGot + buyerGot, milestoneAmt, "sellerAmount + buyerAmount must equal milestone amount");
    }
}
