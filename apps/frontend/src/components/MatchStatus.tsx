import React, { useState, useEffect, useCallback } from 'react';
import { Networks, rpc } from '@stellar/stellar-sdk';

type MatchState = 'Pending' | 'Active' | 'PendingResult' | 'Completed' | 'Cancelled';

interface MatchData {
  id: string;
  state: MatchState;
  player1: string;
  player2: string;
  stakeAmount: string;
  token: string;
  platform: 'lichess' | 'chesscom';
  gameId: string;
  winner?: 'Player1' | 'Player2' | 'Draw';
}

interface MatchStatusProps {
  matchId: string;
  contractId?: string;
  rpcUrl?: string;
  networkPassphrase?: string;
  onFetchMatch?: (matchId: string) => Promise<MatchData | null>;
}

type FetchStatus = 'idle' | 'loading' | 'error';

const TERMINAL_STATES: MatchState[] = ['Completed', 'Cancelled'];

const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

export function MatchStatus({
  matchId,
  contractId,
  rpcUrl = 'https://soroban-testnet.stellar.org',
  networkPassphrase = Networks.TESTNET,
  onFetchMatch,
}: MatchStatusProps) {
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const fetchMatch = useCallback(async () => {
    if (!matchId) return;

    try {
      const data = await onFetchMatch?.(matchId);
      if (data) {
        setMatchData(data);
      }
      setFetchStatus('idle');
    } catch (err) {
      setFetchStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to fetch match status');
    }
  }, [matchId, onFetchMatch]);

  useEffect(() => {
    if (!matchId) return;

    // Initial fetch - set loading status first
    setFetchStatus('loading');
    fetchMatch();

    // Only poll if not in a terminal state
    if (matchData && TERMINAL_STATES.includes(matchData.state)) {
      return; // Don't poll for terminal states
    }

    const interval = setInterval(fetchMatch, 5000);
    return () => clearInterval(interval);
  }, [matchId, fetchMatch, matchData]);

  // No match ID
  if (!matchId) {
    return (
      <div className="match-status" data-testid="match-status">
        <p className="no-match-message">Enter a match ID to view status</p>
      </div>
    );
  }

  // Loading state — animate-pulse skeleton matching the loaded match card layout
  if (fetchStatus === 'loading' && !matchData) {
    return (
      <div className="match-status animate-pulse" data-testid="match-status-skeleton" aria-busy="true" aria-label="Loading match status">
        {/* Title bar */}
        <div className="mb-3 h-6 w-32 rounded bg-slate-200 dark:bg-slate-700" />
        {/* Match ID line */}
        <div className="mb-4 h-4 w-48 rounded bg-slate-200 dark:bg-slate-700" />
        {/* State content block */}
        <div className="space-y-2 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="h-5 w-24 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    );
  }

  // Error state
  if (fetchStatus === 'error' && !matchData) {
    return (
      <div className="match-status" data-testid="match-status">
        <p className="feedback error" role="alert" data-testid="match-error">
          {errorMessage}
        </p>
        <button
          type="button"
          className="btn btn-retry"
          onClick={() => setFetchStatus('loading')}
          data-testid="retry-match-btn"
        >
          Retry
        </button>
      </div>
    );
  }

  // No match found
  if (!matchData) {
    return (
      <div className="match-status" data-testid="match-status">
        <p className="feedback error" role="alert" data-testid="match-not-found">
          Match not found
        </p>
      </div>
    );
  }

  const renderStateContent = () => {
    switch (matchData.state) {
      case 'Pending':
        const p1Deposited = matchData.player1 ? '✓' : '○';
        const p2Deposited = matchData.player2 ? '✓' : '○';
        return (
          <div className="state-content pending" data-testid="state-pending">
            <h3 className="state-title">Pending</h3>
            <p className="state-description">Waiting for both players to deposit their stakes.</p>
            <div className="deposit-status" data-testid="deposit-status">
              <span>
                Player 1: {p1Deposited}{' '}
                {matchData.player1 && (
                  <span className="address-small">
                    ({matchData.player1.slice(0, 4)}...{matchData.player1.slice(-4)})
                  </span>
                )}
              </span>
              <br />
              <span>
                Player 2:{' '}
                {matchData.player2 && (
                  <span className="address-small">
                    ({matchData.player2.slice(0, 4)}...{matchData.player2.slice(-4)})
                  </span>
                )}
                {p2Deposited}
              </span>
            </div>
          </div>
        );

      case 'Active':
        return (
          <div className="state-content active" data-testid="state-active">
            <h3 className="state-title">Active</h3>
            <p className="state-description">
              Game is in progress on {matchData.platform === 'lichess' ? 'Lichess' : 'Chess.com'}.
              Game ID: {matchData.gameId}
            </p>
            <p className="waiting-oracle">Waiting for oracle to submit result…</p>
          </div>
        );

      case 'PendingResult':
        return (
          <div className="state-content pending-result" data-testid="state-pending-result">
            <h3 className="state-title">Result Pending</h3>
            <p className="state-description">
              Oracle has submitted a result. Dispute window is open.
            </p>
            {matchData.winner && (
              <p className="winner-info">
                Reported winner:{' '}
                <strong>
                  {matchData.winner === 'Player1'
                    ? 'Player 1'
                    : matchData.winner === 'Player2'
                      ? 'Player 2'
                      : 'Draw'}
                </strong>
              </p>
            )}
          </div>
        );

      case 'Completed':
        if (!matchData.winner) {
          return (
            <div className="state-content completed" data-testid="state-completed">
              <h3 className="state-title">Completed</h3>
              <p className="state-description">Match completed.</p>
            </div>
          );
        }
        return (
          <div className="state-content completed" data-testid="state-completed">
            <h3 className="state-title">Completed</h3>
            <p className="state-description">
              {matchData.winner === 'Draw'
                ? 'The match ended in a draw. Stakes have been returned to both players.'
                : `Winner: ${matchData.winner === 'Player1' ? 'Player 1' : 'Player 2'}. Prize of ${matchData.stakeAmount} ${matchData.token.toUpperCase()} has been paid out.`}
            </p>
          </div>
        );

      case 'Cancelled':
        return (
          <div className="state-content cancelled" data-testid="state-cancelled">
            <h3 className="state-title">Cancelled</h3>
            <p className="state-description">
              This match has been cancelled. Any deposited stakes have been refunded.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="match-status" data-testid="match-status">
      <h2 className="match-status-title">Match Status</h2>
      <div className="match-id-display" data-testid="match-id-display">
        Match ID: <strong>{matchData.id}</strong>
      </div>
      {renderStateContent()}
    </div>
  );
}

export default MatchStatus;
