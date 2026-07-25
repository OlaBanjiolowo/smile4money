import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MatchStatus } from '../src/components/MatchStatus';

vi.mock('@stellar/stellar-sdk', () => ({
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  rpc: {
    Server: vi.fn().mockImplementation(() => ({
      sendTransaction: vi.fn(),
      getTransaction: vi.fn(),
      pollTransaction: vi.fn(),
    })),
    Api: {
      GetTransactionStatus: {
        SUCCESS: 'SUCCESS',
        NOT_FOUND: 'NOT_FOUND',
        FAILED: 'FAILED',
      },
    },
  },
}));

describe('MatchStatus — loading state', () => {
  it('shows loading state while fetching match', () => {
    render(<MatchStatus matchId="123" />);
    expect(screen.getByTestId('match-status')).toBeInTheDocument();
  });
});

describe('MatchStatus — no match ID', () => {
  it('shows message when no match ID provided', () => {
    render(<MatchStatus matchId="" />);
    expect(screen.getByTestId('match-status')).toBeInTheDocument();
    expect(screen.getByText(/Enter a match ID/i)).toBeInTheDocument();
  });
});

describe('MatchStatus — match not found', () => {
  it('shows error when match not found (onFetchMatch returns null)', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue(null);

    render(<MatchStatus matchId="invalid" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('match-not-found')).toBeInTheDocument();
    });
  });
});

describe('MatchStatus — state rendering with match data', () => {
  it('renders pending state when match data is available', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '123',
      state: 'Pending',
      player1: 'GPLAYER1ABC',
      player2: 'GPLAYER2XYZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'game-abc',
    });

    render(<MatchStatus matchId="123" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-pending')).toBeInTheDocument();
    });
  });

  it('renders active state when match data is available', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '123',
      state: 'Active',
      player1: 'GPLAYER1ABC',
      player2: 'GPLAYER2XYZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'game-abc',
    });

    render(<MatchStatus matchId="123" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-active')).toBeInTheDocument();
    });
  });

  it('renders completed state with winner', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '123',
      state: 'Completed',
      player1: 'GPLAYER1ABC',
      player2: 'GPLAYER2XYZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'game-abc',
      winner: 'Player1',
    });

    render(<MatchStatus matchId="123" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-completed')).toBeInTheDocument();
    });
  });

  it('renders cancelled state when match data is available', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '123',
      state: 'Cancelled',
      player1: 'GPLAYER1ABC',
      player2: 'GPLAYER2XYZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'game-abc',
    });

    render(<MatchStatus matchId="123" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1125 — Cancelled state UI tests with cancellation reason paths
// ─────────────────────────────────────────────────────────────────────────────
//
// Covers both cancellation paths:
//   1. cancelled_by_player — a player explicitly called cancel_match
//   2. timed_out           — the match timed out without an oracle result
//
// Also verifies the refund display for:
//   - No deposits made (no refund section)
//   - Only player1 deposited (player1 refund only)
//   - Both players deposited (both refunds shown)

describe('MatchStatus — Cancelled state (cancelled by player)', () => {
  it('shows cancel-reason-player section when cancelled by player1', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '42',
      state: 'Cancelled',
      player1: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player2: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'cancel-game-1',
      cancellationReason: 'cancelled_by_player',
      cancelledBy: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player1Deposited: false,
      player2Deposited: false,
    });

    render(<MatchStatus matchId="42" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });

    expect(screen.getByTestId('cancel-reason-player')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-reason-player').textContent).toMatch(/Player 1/i);
    expect(screen.queryByTestId('cancel-reason-timeout')).not.toBeInTheDocument();
  });

  it('shows cancel-reason-player section when cancelled by player2', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '43',
      state: 'Cancelled',
      player1: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player2: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'cancel-game-2',
      cancellationReason: 'cancelled_by_player',
      cancelledBy: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      player1Deposited: false,
      player2Deposited: false,
    });

    render(<MatchStatus matchId="43" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });

    expect(screen.getByTestId('cancel-reason-player')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-reason-player').textContent).toMatch(/Player 2/i);
  });
});

describe('MatchStatus — Cancelled state (timed out)', () => {
  it('shows cancel-reason-timeout section for timed_out cancellation', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '44',
      state: 'Cancelled',
      player1: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player2: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      stakeAmount: '200',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'timeout-game-1',
      cancellationReason: 'timed_out',
      player1Deposited: true,
      player2Deposited: true,
    });

    render(<MatchStatus matchId="44" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });

    expect(screen.getByTestId('cancel-reason-timeout')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-reason-timeout').textContent).toMatch(/timed out/i);
    expect(screen.queryByTestId('cancel-reason-player')).not.toBeInTheDocument();
  });

  it('shows refund info for both players when both deposited and match timed out', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '45',
      state: 'Cancelled',
      player1: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player2: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      stakeAmount: '250',
      token: 'usdc',
      platform: 'chesscom',
      gameId: 'timeout-game-2',
      cancellationReason: 'timed_out',
      player1Deposited: true,
      player2Deposited: true,
    });

    render(<MatchStatus matchId="45" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });

    expect(screen.getByTestId('refund-info')).toBeInTheDocument();
    expect(screen.getByTestId('refund-player1')).toBeInTheDocument();
    expect(screen.getByTestId('refund-player1').textContent).toMatch(/250/);
    expect(screen.getByTestId('refund-player1').textContent).toMatch(/USDC/i);
    expect(screen.getByTestId('refund-player2')).toBeInTheDocument();
    expect(screen.getByTestId('refund-player2').textContent).toMatch(/250/);
  });
});

describe('MatchStatus — Cancelled state (refund display)', () => {
  it('shows only player1 refund when only player1 deposited', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '46',
      state: 'Cancelled',
      player1: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player2: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'partial-dep-cancel',
      cancellationReason: 'cancelled_by_player',
      cancelledBy: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      player1Deposited: true,
      player2Deposited: false,
    });

    render(<MatchStatus matchId="46" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });

    expect(screen.getByTestId('refund-info')).toBeInTheDocument();
    expect(screen.getByTestId('refund-player1')).toBeInTheDocument();
    // player2 had no deposit — no refund entry
    expect(screen.queryByTestId('refund-player2')).not.toBeInTheDocument();
  });

  it('shows no-refund-info section when no deposits were made', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '47',
      state: 'Cancelled',
      player1: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player2: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'no-dep-cancel',
      cancellationReason: 'cancelled_by_player',
      cancelledBy: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player1Deposited: false,
      player2Deposited: false,
    });

    render(<MatchStatus matchId="47" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });

    expect(screen.getByTestId('no-refund-info')).toBeInTheDocument();
    expect(screen.queryByTestId('refund-info')).not.toBeInTheDocument();
    expect(screen.queryByTestId('refund-player1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('refund-player2')).not.toBeInTheDocument();
  });

  it('shows both player1 and player2 refunds when both deposited before player-cancel', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '48',
      state: 'Cancelled',
      player1: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player2: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      stakeAmount: '300',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'both-dep-cancel',
      cancellationReason: 'cancelled_by_player',
      cancelledBy: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player1Deposited: true,
      player2Deposited: true,
    });

    render(<MatchStatus matchId="48" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });

    expect(screen.getByTestId('refund-info')).toBeInTheDocument();
    expect(screen.getByTestId('refund-player1')).toBeInTheDocument();
    expect(screen.getByTestId('refund-player2')).toBeInTheDocument();
    expect(screen.queryByTestId('no-refund-info')).not.toBeInTheDocument();
  });

  it('renders the Cancelled state without cancellationReason (generic fallback)', async () => {
    // When cancellationReason is not provided, a generic message is shown
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '49',
      state: 'Cancelled',
      player1: 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      player2: 'GPLAYER2ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'no-reason-cancel',
    });

    render(<MatchStatus matchId="49" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });

    // Neither specific reason testid should be present
    expect(screen.queryByTestId('cancel-reason-timeout')).not.toBeInTheDocument();
    // Without cancelledBy, it falls back to the generic cancel-reason-player element
    // with the generic "cancelled" message
    expect(screen.getByTestId('cancel-reason-player')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-reason-player').textContent).toMatch(/cancelled/i);
  });
});
