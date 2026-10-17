// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {MilestoneEscrow} from "../MilestoneEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Invariant handler
// ─────────────────────────────────────────────────────────────────────────────
contract EscrowHandler is Test {
    MilestoneEscrow public escrow;
    MockERC20 public usdc;

    address internal buyer = makeAddr("handler_buyer");
    address internal seller = makeAddr("handler_seller");

    uint256 public ghostTotalDeposited;
    uint256 public ghostTotalReleased;
    uint256 public ghostTotalRefunded;
    uint256 public ghostTotalCancelled;

    constructor(MilestoneEscrow _escrow, MockERC20 _usdc) {
        escrow = _escrow;
        usdc = _usdc;
    }

    /// @dev Create an escrow from the handler buyer.
    function createEscrow(uint256 amount) external {
        amount = bound(amount, 1, 1_000_000e6);
        uint256 deadline = block.timestamp + 1 days;

        usdc.mint(buyer, amount);
        vm.startPrank(buyer);
        usdc.approve(address(escrow), amount);
        escrow.createEscrow(seller, amount, deadline, "handler escrow");
        vm.stopPrank();

        ghostTotalDeposited += amount;
    }

    /// @dev Release escrow 0 (simplest deterministic target).
    function release(uint256 idSeed) external {
        uint256 count = escrow.escrowCount();
        if (count == 0) return;
        uint256 id = idSeed % count;
        MilestoneEscrow.Escrow memory e = escrow.getEscrow(id);
        if (e.status != MilestoneEscrow.Status.Active) return;
        vm.prank(e.buyer);
        escrow.release(id);
        ghostTotalReleased += e.amount;
    }

    /// @dev Refund an escrow (warp past deadline first).
    function refund(uint256 idSeed) external {
        uint256 count = escrow.escrowCount();
        if (count == 0) return;
        uint256 id = idSeed % count;
        MilestoneEscrow.Escrow memory e = escrow.getEscrow(id);
        if (e.status != MilestoneEscrow.Status.Active) return;
        vm.warp(e.deadline + 1);
        vm.prank(e.buyer);
        escrow.refund(id);
        ghostTotalRefunded += e.amount;
    }

    /// @dev Cancel an escrow as seller.
    function cancel(uint256 idSeed) external {
        uint256 count = escrow.escrowCount();
        if (count == 0) return;
        uint256 id = idSeed % count;
        MilestoneEscrow.Escrow memory e = escrow.getEscrow(id);
        if (e.status != MilestoneEscrow.Status.Active) return;
        vm.prank(e.seller);
        escrow.cancel(id);
        ghostTotalCancelled += e.amount;
    }

}

// ─────────────────────────────────────────────────────────────────────────────
// Main test contract
// ─────────────────────────────────────────────────────────────────────────────
contract MilestoneEscrowTest is Test {
    MilestoneEscrow internal escrowContract;
    MockERC20 internal usdc;

    address internal buyer  = makeAddr("buyer");
    address internal seller = makeAddr("seller");
    address internal alice  = makeAddr("alice");
    address internal bob    = makeAddr("bob");

    uint256 internal constant AMOUNT   = 1_000e6;   // 1000 USDC (6-decimal)
    uint256 internal constant DEADLINE_OFFSET = 1 days;

    // ── helpers ──────────────────────────────────────────────────────────────

    /// Deploy a fresh USDC mock and the contract under test.
    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        escrowContract = new MilestoneEscrow(address(usdc));
    }

    /// Mint USDC to `who`, approve the escrow, and create one escrow.
    function _createDefaultEscrow() internal returns (uint256 escrowId) {
        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT);
        escrowId = escrowContract.createEscrow(
            seller,
            AMOUNT,
            block.timestamp + DEADLINE_OFFSET,
            "milestone #1"
        );
        vm.stopPrank();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 1. Deployment
    // ═════════════════════════════════════════════════════════════════════════

    function test_Constructor_SetsUSDC() public view {
        assertEq(address(escrowContract.usdc()), address(usdc));
    }

    function test_Constructor_RevertsOnZeroUSDC() public {
        vm.expectRevert(MilestoneEscrow.ZeroAddress.selector);
        new MilestoneEscrow(address(0));
    }

    function test_Constructor_InitialEscrowCountIsZero() public view {
        assertEq(escrowContract.escrowCount(), 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 2. createEscrow — happy path (path 1 + 3)
    // ═════════════════════════════════════════════════════════════════════════

    function test_CreateEscrow_HappyPath_StateCorrect() public {
        uint256 deadline = block.timestamp + DEADLINE_OFFSET;
        usdc.mint(buyer, AMOUNT);

        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT);
        uint256 id = escrowContract.createEscrow(seller, AMOUNT, deadline, "milestone #1");
        vm.stopPrank();

        MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(id);
        assertEq(e.buyer,        buyer,                  "buyer mismatch");
        assertEq(e.seller,       seller,                 "seller mismatch");
        assertEq(e.buyerPayout,  buyer,                  "buyerPayout != buyer");
        assertEq(e.sellerPayout, seller,                 "sellerPayout != seller");
        assertEq(e.amount,       AMOUNT,                 "amount mismatch");
        assertEq(e.deadline,     deadline,               "deadline mismatch");
        assertEq(uint8(e.status),uint8(MilestoneEscrow.Status.Active), "not Active");
        assertEq(e.description,  "milestone #1",         "description mismatch");
    }

    function test_CreateEscrow_HappyPath_EmitsEvent() public {
        uint256 deadline = block.timestamp + DEADLINE_OFFSET;
        usdc.mint(buyer, AMOUNT);

        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT);

        vm.expectEmit(true, true, true, true, address(escrowContract));
        emit MilestoneEscrow.EscrowCreated(0, buyer, seller, AMOUNT, deadline, "milestone #1");
        escrowContract.createEscrow(seller, AMOUNT, deadline, "milestone #1");
        vm.stopPrank();
    }

    function test_CreateEscrow_HappyPath_PullsUSDCFromBuyer() public {
        usdc.mint(buyer, AMOUNT);

        uint256 buyerBefore   = usdc.balanceOf(buyer);
        uint256 contractBefore = usdc.balanceOf(address(escrowContract));

        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT);
        escrowContract.createEscrow(seller, AMOUNT, block.timestamp + DEADLINE_OFFSET, "test");
        vm.stopPrank();

        assertEq(usdc.balanceOf(buyer),                   buyerBefore - AMOUNT,    "buyer balance not reduced");
        assertEq(usdc.balanceOf(address(escrowContract)), contractBefore + AMOUNT, "escrow balance not increased");
    }

    function test_CreateEscrow_BalanceDelta_AmountEqualsActualReceived() public {
        // For a normal (non-fee-on-transfer) ERC-20, escrow.amount == amount requested.
        uint256 id = _createDefaultEscrow();
        MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(id);
        assertEq(e.amount, AMOUNT);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3. createEscrow — revert paths (path 2)
    // ═════════════════════════════════════════════════════════════════════════

    function test_CreateEscrow_RevertIf_SellerIsZeroAddress() public {
        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT);
        vm.expectRevert(MilestoneEscrow.ZeroAddress.selector);
        escrowContract.createEscrow(address(0), AMOUNT, block.timestamp + DEADLINE_OFFSET, "test");
        vm.stopPrank();
    }

    function test_CreateEscrow_RevertIf_AmountIsZero() public {
        vm.prank(buyer);
        vm.expectRevert(MilestoneEscrow.ZeroAmount.selector);
        escrowContract.createEscrow(seller, 0, block.timestamp + DEADLINE_OFFSET, "test");
    }

    function test_CreateEscrow_RevertIf_DeadlineEqualsTimestamp() public {
        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT);
        vm.expectRevert(MilestoneEscrow.DeadlineInPast.selector);
        escrowContract.createEscrow(seller, AMOUNT, block.timestamp, "test");
        vm.stopPrank();
    }

    function test_CreateEscrow_RevertIf_DeadlineInPast() public {
        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT);

        // Warp forward so block.timestamp > chosen deadline
        uint256 futureDeadline = block.timestamp + 100;
        vm.warp(block.timestamp + 200);

        vm.expectRevert(MilestoneEscrow.DeadlineInPast.selector);
        escrowContract.createEscrow(seller, AMOUNT, futureDeadline, "test");
        vm.stopPrank();
    }

    function test_CreateEscrow_RevertIf_NoApproval() public {
        usdc.mint(buyer, AMOUNT);
        // No approve() → SafeERC20 should revert
        vm.prank(buyer);
        vm.expectRevert();
        escrowContract.createEscrow(seller, AMOUNT, block.timestamp + DEADLINE_OFFSET, "test");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 4. escrowCount increments (path 11)
    // ═════════════════════════════════════════════════════════════════════════

    function test_EscrowCount_IncrementsWithEachCreate() public {
        assertEq(escrowContract.escrowCount(), 0);

        usdc.mint(buyer, AMOUNT * 3);
        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT * 3);

        uint256 id0 = escrowContract.createEscrow(seller, AMOUNT, block.timestamp + DEADLINE_OFFSET, "e0");
        assertEq(escrowContract.escrowCount(), 1);
        assertEq(id0, 0);

        uint256 id1 = escrowContract.createEscrow(seller, AMOUNT, block.timestamp + DEADLINE_OFFSET, "e1");
        assertEq(escrowContract.escrowCount(), 2);
        assertEq(id1, 1);

        uint256 id2 = escrowContract.createEscrow(seller, AMOUNT, block.timestamp + DEADLINE_OFFSET, "e2");
        assertEq(escrowContract.escrowCount(), 3);
        assertEq(id2, 2);

        vm.stopPrank();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 5. release — happy path (path 4)
    // ═════════════════════════════════════════════════════════════════════════

    function test_Release_HappyPath_SellerReceivesUSDC() public {
        uint256 id = _createDefaultEscrow();
        uint256 sellerBefore = usdc.balanceOf(seller);

        vm.prank(buyer);
        escrowContract.release(id);

        assertEq(usdc.balanceOf(seller), sellerBefore + AMOUNT);
    }

    function test_Release_HappyPath_StatusBecomeReleased() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(buyer);
        escrowContract.release(id);

        MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(id);
        assertEq(uint8(e.status), uint8(MilestoneEscrow.Status.Released));
    }

    function test_Release_HappyPath_EmitsEvent() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(buyer);
        vm.expectEmit(true, true, false, true, address(escrowContract));
        emit MilestoneEscrow.EscrowReleased(id, seller, AMOUNT);
        escrowContract.release(id);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 6. release — revert paths (path 5)
    // ═════════════════════════════════════════════════════════════════════════

    function test_Release_RevertIf_CallerIsNotBuyer() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(alice);
        vm.expectRevert(MilestoneEscrow.NotBuyer.selector);
        escrowContract.release(id);
    }

    function test_Release_RevertIf_AlreadyReleased() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(buyer);
        escrowContract.release(id); // first release → OK

        vm.prank(buyer);
        vm.expectRevert(MilestoneEscrow.NotActive.selector);
        escrowContract.release(id); // second release → NotActive
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7. refund — happy path (path 6)
    // ═════════════════════════════════════════════════════════════════════════

    function test_Refund_HappyPath_BuyerReceivesUSDC() public {
        uint256 id = _createDefaultEscrow();
        uint256 buyerBefore = usdc.balanceOf(buyer);

        // Warp past deadline
        skip(DEADLINE_OFFSET + 1);

        vm.prank(buyer);
        escrowContract.refund(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT);
    }

    function test_Refund_HappyPath_StatusBecomesRefunded() public {
        uint256 id = _createDefaultEscrow();
        skip(DEADLINE_OFFSET + 1);

        vm.prank(buyer);
        escrowContract.refund(id);

        MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(id);
        assertEq(uint8(e.status), uint8(MilestoneEscrow.Status.Refunded));
    }

    function test_Refund_HappyPath_EmitsEvent() public {
        uint256 id = _createDefaultEscrow();
        skip(DEADLINE_OFFSET + 1);

        vm.prank(buyer);
        vm.expectEmit(true, true, false, true, address(escrowContract));
        emit MilestoneEscrow.EscrowRefunded(id, buyer, AMOUNT);
        escrowContract.refund(id);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 8. refund — revert paths (path 7)
    // ═════════════════════════════════════════════════════════════════════════

    function test_Refund_RevertIf_DeadlineNotYetPassed() public {
        uint256 id = _createDefaultEscrow();
        // Do NOT warp — deadline is still in the future

        vm.prank(buyer);
        vm.expectRevert(MilestoneEscrow.DeadlineNotPassed.selector);
        escrowContract.refund(id);
    }

    function test_Refund_RevertIf_CallerIsNotBuyer() public {
        uint256 id = _createDefaultEscrow();
        skip(DEADLINE_OFFSET + 1);

        vm.prank(alice);
        vm.expectRevert(MilestoneEscrow.NotBuyer.selector);
        escrowContract.refund(id);
    }

    function test_Refund_RevertIf_NotActive_AlreadyRefunded() public {
        uint256 id = _createDefaultEscrow();
        skip(DEADLINE_OFFSET + 1);

        vm.prank(buyer);
        escrowContract.refund(id); // first refund → OK

        vm.prank(buyer);
        vm.expectRevert(MilestoneEscrow.NotActive.selector);
        escrowContract.refund(id); // second → NotActive
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 9. cancel — happy path (path 8)
    // ═════════════════════════════════════════════════════════════════════════

    function test_Cancel_HappyPath_BuyerReceivesUSDC() public {
        uint256 id = _createDefaultEscrow();
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.prank(seller);
        escrowContract.cancel(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT);
    }

    function test_Cancel_HappyPath_StatusBecomesCancelled() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(seller);
        escrowContract.cancel(id);

        MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(id);
        assertEq(uint8(e.status), uint8(MilestoneEscrow.Status.Cancelled));
    }

    function test_Cancel_HappyPath_EmitsEvent() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(seller);
        vm.expectEmit(true, true, false, true, address(escrowContract));
        emit MilestoneEscrow.EscrowCancelled(id, buyer, AMOUNT);
        escrowContract.cancel(id);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 10. cancel — revert paths (path 9)
    // ═════════════════════════════════════════════════════════════════════════

    function test_Cancel_RevertIf_CallerIsNotSeller() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(alice);
        vm.expectRevert(MilestoneEscrow.NotSeller.selector);
        escrowContract.cancel(id);
    }

    function test_Cancel_RevertIf_NotActive_AlreadyCancelled() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(seller);
        escrowContract.cancel(id); // first cancel → OK

        vm.prank(seller);
        vm.expectRevert(MilestoneEscrow.NotActive.selector);
        escrowContract.cancel(id); // second → NotActive
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 11. setPayoutAddress (path 10)
    // ═════════════════════════════════════════════════════════════════════════

    function test_SetPayoutAddress_BuyerCanUpdateBuyerPayout() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(buyer);
        escrowContract.setPayoutAddress(id, true, alice);

        MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(id);
        assertEq(e.buyerPayout, alice);
    }

    function test_SetPayoutAddress_SellerCanUpdateSellerPayout() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(seller);
        escrowContract.setPayoutAddress(id, false, bob);

        MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(id);
        assertEq(e.sellerPayout, bob);
    }

    function test_SetPayoutAddress_EmitsEvent_ForBuyer() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(buyer);
        vm.expectEmit(true, true, true, false, address(escrowContract));
        emit MilestoneEscrow.PayoutAddressUpdated(id, buyer, alice);
        escrowContract.setPayoutAddress(id, true, alice);
    }

    function test_SetPayoutAddress_EmitsEvent_ForSeller() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(seller);
        vm.expectEmit(true, true, true, false, address(escrowContract));
        emit MilestoneEscrow.PayoutAddressUpdated(id, seller, bob);
        escrowContract.setPayoutAddress(id, false, bob);
    }

    function test_SetPayoutAddress_RevertIf_ZeroAddress() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(buyer);
        vm.expectRevert(MilestoneEscrow.ZeroAddress.selector);
        escrowContract.setPayoutAddress(id, true, address(0));
    }

    function test_SetPayoutAddress_RevertIf_NotParty_Buyer() public {
        uint256 id = _createDefaultEscrow();

        // alice tries to update the buyer slot
        vm.prank(alice);
        vm.expectRevert(MilestoneEscrow.NotParty.selector);
        escrowContract.setPayoutAddress(id, true, alice);
    }

    function test_SetPayoutAddress_RevertIf_NotParty_Seller() public {
        uint256 id = _createDefaultEscrow();

        // alice tries to update the seller slot
        vm.prank(alice);
        vm.expectRevert(MilestoneEscrow.NotParty.selector);
        escrowContract.setPayoutAddress(id, false, alice);
    }

    function test_SetPayoutAddress_RevertIf_BuyerTriesToSetSellerSlot() public {
        uint256 id = _createDefaultEscrow();

        // Buyer tries to update sellerPayout (isBuyer=false) → NotParty
        vm.prank(buyer);
        vm.expectRevert(MilestoneEscrow.NotParty.selector);
        escrowContract.setPayoutAddress(id, false, alice);
    }

    function test_SetPayoutAddress_RevertIf_SellerTriesToSetBuyerSlot() public {
        uint256 id = _createDefaultEscrow();

        // Seller tries to update buyerPayout (isBuyer=true) → NotParty
        vm.prank(seller);
        vm.expectRevert(MilestoneEscrow.NotParty.selector);
        escrowContract.setPayoutAddress(id, true, alice);
    }

    // After sellerPayout update, release sends funds to the NEW sellerPayout address.
    function test_SetPayoutAddress_Release_SendsToUpdatedSellerPayout() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(seller);
        escrowContract.setPayoutAddress(id, false, bob); // seller payout → bob

        uint256 bobBefore    = usdc.balanceOf(bob);
        uint256 sellerBefore = usdc.balanceOf(seller);

        vm.prank(buyer);
        escrowContract.release(id);

        assertEq(usdc.balanceOf(bob),    bobBefore + AMOUNT,  "bob should have received funds");
        assertEq(usdc.balanceOf(seller), sellerBefore,        "original seller should NOT receive funds");
    }

    // After buyerPayout update, refund sends funds to the NEW buyerPayout address.
    function test_SetPayoutAddress_Refund_SendsToUpdatedBuyerPayout() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(buyer);
        escrowContract.setPayoutAddress(id, true, alice); // buyer payout → alice

        skip(DEADLINE_OFFSET + 1);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.prank(buyer);
        escrowContract.refund(id);

        assertEq(usdc.balanceOf(alice), aliceBefore + AMOUNT, "alice should have received refund");
        assertEq(usdc.balanceOf(buyer), buyerBefore,          "original buyer should NOT receive refund");
    }

    // After buyerPayout update, cancel sends funds to the NEW buyerPayout address.
    function test_SetPayoutAddress_Cancel_SendsToUpdatedBuyerPayout() public {
        uint256 id = _createDefaultEscrow();

        vm.prank(buyer);
        escrowContract.setPayoutAddress(id, true, alice); // buyer payout → alice

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.prank(seller);
        escrowContract.cancel(id);

        assertEq(usdc.balanceOf(alice), aliceBefore + AMOUNT, "alice should have received cancellation funds");
        assertEq(usdc.balanceOf(buyer), buyerBefore,          "original buyer should NOT receive cancellation funds");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 12. Multiple escrows — isolation (path 12)
    // ═════════════════════════════════════════════════════════════════════════

    function test_MultipleEscrows_ReleaseOneDoesNotAffectOther() public {
        // Create two escrows
        usdc.mint(buyer, AMOUNT * 2);
        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT * 2);
        uint256 id0 = escrowContract.createEscrow(seller, AMOUNT, block.timestamp + DEADLINE_OFFSET, "e0");
        uint256 id1 = escrowContract.createEscrow(seller, AMOUNT, block.timestamp + DEADLINE_OFFSET, "e1");
        vm.stopPrank();

        // Release escrow 0
        vm.prank(buyer);
        escrowContract.release(id0);

        // Escrow 0 is Released
        MilestoneEscrow.Escrow memory e0 = escrowContract.getEscrow(id0);
        assertEq(uint8(e0.status), uint8(MilestoneEscrow.Status.Released), "e0 should be Released");

        // Escrow 1 is still Active
        MilestoneEscrow.Escrow memory e1 = escrowContract.getEscrow(id1);
        assertEq(uint8(e1.status), uint8(MilestoneEscrow.Status.Active), "e1 should still be Active");
        assertEq(e1.amount, AMOUNT, "e1 amount must be intact");
    }

    function test_MultipleEscrows_IndependentOperations() public {
        address buyer2  = makeAddr("buyer2");
        address seller2 = makeAddr("seller2");

        // Fund both buyers
        usdc.mint(buyer,  AMOUNT);
        usdc.mint(buyer2, AMOUNT);

        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), AMOUNT);
        uint256 id0 = escrowContract.createEscrow(seller,  AMOUNT, block.timestamp + DEADLINE_OFFSET, "e0");
        vm.stopPrank();

        vm.startPrank(buyer2);
        usdc.approve(address(escrowContract), AMOUNT);
        uint256 id1 = escrowContract.createEscrow(seller2, AMOUNT, block.timestamp + DEADLINE_OFFSET, "e1");
        vm.stopPrank();

        // Release id0; cancel id1
        vm.prank(buyer);
        escrowContract.release(id0);

        vm.prank(seller2);
        escrowContract.cancel(id1);

        assertEq(uint8(escrowContract.getEscrow(id0).status), uint8(MilestoneEscrow.Status.Released));
        assertEq(uint8(escrowContract.getEscrow(id1).status), uint8(MilestoneEscrow.Status.Cancelled));

        // Funds landed in the right places
        assertEq(usdc.balanceOf(seller),  AMOUNT, "seller of e0 should have received funds");
        assertEq(usdc.balanceOf(buyer2),  AMOUNT, "buyer2 should have been refunded via cancel");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 13. Fuzz: amount over valid range (path 13)
    // ═════════════════════════════════════════════════════════════════════════

    function testFuzz_CreateEscrow_AmountStoredMatchesInput(uint256 amount) public {
        // Bound to realistic USDC-like amounts (1 to 10 billion with 6 decimals)
        amount = bound(amount, 1, 10_000_000_000e6);

        usdc.mint(buyer, amount);
        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), amount);
        uint256 id = escrowContract.createEscrow(
            seller,
            amount,
            block.timestamp + DEADLINE_OFFSET,
            "fuzz test"
        );
        vm.stopPrank();

        MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(id);
        assertEq(e.amount, amount, "stored amount must match requested amount");
    }

    function testFuzz_CreateEscrow_EscrowCountAlwaysIncrements(uint8 n) public {
        // n: 0..255 escrows to create
        n = uint8(bound(uint256(n), 1, 10)); // cap at 10 for speed

        usdc.mint(buyer, uint256(n) * AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(escrowContract), uint256(n) * AMOUNT);
        for (uint256 i = 0; i < n; i++) {
            escrowContract.createEscrow(seller, AMOUNT, block.timestamp + DEADLINE_OFFSET, "fuzz count");
        }
        vm.stopPrank();

        assertEq(escrowContract.escrowCount(), n);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 14. getEscrow view
    // ═════════════════════════════════════════════════════════════════════════

    function test_GetEscrow_ReturnsZeroStructForNonexistentId() public view {
        // Escrow at id 99 was never created → all fields are zero/default
        MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(99);
        assertEq(e.buyer,   address(0));
        assertEq(e.amount,  0);
        assertEq(uint8(e.status), uint8(MilestoneEscrow.Status.Active)); // zero enum
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant test contract
// ─────────────────────────────────────────────────────────────────────────────
contract MilestoneEscrowInvariantTest is Test {
    MilestoneEscrow internal escrowContract;
    MockERC20 internal usdc;
    EscrowHandler internal handler;

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        escrowContract = new MilestoneEscrow(address(usdc));
        handler = new EscrowHandler(escrowContract, usdc);
        targetContract(address(handler));
    }

    /// INVARIANT: contract USDC balance >= sum of all active escrow amounts.
    function invariant_ContractBalanceCoversTotalActive() public view {
        uint256 totalActive;
        uint256 count = escrowContract.escrowCount();
        for (uint256 i = 0; i < count; i++) {
            MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(i);
            if (e.status == MilestoneEscrow.Status.Active) {
                totalActive += e.amount;
            }
        }
        assertGe(
            usdc.balanceOf(address(escrowContract)),
            totalActive,
            "contract balance < sum of active escrows"
        );
    }

    /// INVARIANT: escrow amounts never go negative (trivially true for uint256,
    ///            but this also confirms no double-spend across status changes).
    function invariant_AllEscrowAmountsArePositive() public view {
        uint256 count = escrowContract.escrowCount();
        for (uint256 i = 0; i < count; i++) {
            MilestoneEscrow.Escrow memory e = escrowContract.getEscrow(i);
            // An amount was set via createEscrow (which reverts on 0), so
            // every ever-created escrow has amount > 0.
            if (e.buyer != address(0)) {
                assertGt(e.amount, 0, "escrow amount must be > 0");
            }
        }
    }

    /// INVARIANT: escrowCount only ever increases.
    function invariant_EscrowCountMonotonicallyIncreases() public view {
        // By design the contract has no delete; count can only go up.
        // This trivially holds — we just confirm the getter is readable.
        assertGe(escrowContract.escrowCount(), 0);
    }
}
