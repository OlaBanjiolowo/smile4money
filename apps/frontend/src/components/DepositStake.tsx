import React, { useState, useEffect, useCallback } from 'react';
import { Networks, rpc } from '@stellar/stellar-sdk';

type DepositStatus = 'idle' | 'loading' | 'pending' | 'success' | 'error' | 'approving';
type AllowanceStatus = 'unknown' | 'checking' | 'sufficient' | 'insufficient';

interface MatchDetails {
  stakeAmount: string;
  token: string;
  player1: string;
  player2: string;
  player1Deposited: boolean;
  player2Deposited: boolean;
}

interface DepositStakeProps {
  matchId: string;
  playerAddress: string | null;
  contractId: string;
  networkPassphrase?: string;
  rpcUrl?: string;
  onDeposit?: (matchId: string) => Promise<void>;
  /** Called when the user clicks 'Approve Token'. Should submit an approve/allowance tx. */
  onApprove?: (matchId: string) => Promise<void>;
  /** Optional: externally supply allowance status to skip the internal check. */
  allowanceSufficient?: boolean | null;
  /** Optional: externally supply allowance check function. */
  checkAllowance?: (playerAddress: string, contractId: string) => Promise<boolean>;
}

export function DepositStake({
  matchId,
  playerAddress,
  contractId,
  networkPassphrase = Networks.TESTNET,
  rpcUrl = 'https://soroban-testnet.stellar.org',
  onDeposit,
  onApprove,
  allowanceSufficient = null,
  checkAllowance,
}: DepositStakeProps) {
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null);
  const [status, setStatus] = useState<DepositStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [allowanceStatus, setAllowanceStatus] = useState<AllowanceStatus>('unknown');

  const hasDeposited = (matchDetails: MatchDetails | null): boolean => {
    if (!matchDetails || !playerAddress) return false;
    return matchDetails.player1Deposited || matchDetails.player2Deposited;
  };

  const fetchMatchDetails = useCallback(async () => {
    if (!matchId || !contractId) return;

    setStatus('loading');
    try {
      // In a real implementation, this would call the contract's get_match function
      // For now, we simulate with mock data
      const mockDetails: MatchDetails = {
        stakeAmount: '100',
        token: 'xlm',
        player1: 'GPLAYER1...',
        player2: 'GPLAYER2...',
        player1Deposited: false,
        player2Deposited: false,
      };
      setMatchDetails(mockDetails);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch match details');
    }
  }, [matchId, contractId]);

  useEffect(() => {
    fetchMatchDetails();
  }, [fetchMatchDetails]);

  // Sync externally-supplied allowance status when the prop changes
  useEffect(() => {
    if (allowanceSufficient === null) return;
    setAllowanceStatus(allowanceSufficient ? 'sufficient' : 'insufficient');
  }, [allowanceSufficient]);

  // Run the internal allowance check whenever the player or contract changes
  const verifyAllowance = useCallback(async () => {
    if (!playerAddress || !contractId) return;

    // If a custom checker was provided, use it; otherwise default to sufficient
    // (XLM is a native asset with no ERC-20-style allowance requirement)
    if (checkAllowance) {
      setAllowanceStatus('checking');
      try {
        const ok = await checkAllowance(playerAddress, contractId);
        setAllowanceStatus(ok ? 'sufficient' : 'insufficient');
      } catch {
        // On error, default to sufficient so the deposit button stays usable
        setAllowanceStatus('sufficient');
      }
    } else {
      // No checker supplied — XLM native tokens do not require approval
      setAllowanceStatus('sufficient');
    }
  }, [playerAddress, contractId, checkAllowance]);

  useEffect(() => {
    if (allowanceSufficient !== null) return; // Controlled externally
    verifyAllowance();
  }, [allowanceSufficient, verifyAllowance]);

  const handleApprove = useCallback(async () => {
    if (!matchId) return;

    setStatus('approving');
    setErrorMsg('');

    try {
      await onApprove?.(matchId);
      // Re-check allowance after approval
      await verifyAllowance();
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Approval transaction failed');
    }
  }, [matchId, onApprove, verifyAllowance]);

  const handleDeposit = useCallback(async () => {
    if (!matchId) return;

    setStatus('pending');
    setErrorMsg('');
    setTxHash(null);

    try {
      await onDeposit?.(matchId);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Deposit transaction failed');
    }
  }, [matchId, onDeposit]);

  const isLoading = status === 'loading';
  const isPending = status === 'pending';
  const isApproving = status === 'approving';
  const isCheckingAllowance = allowanceStatus === 'checking';
  const needsApproval = allowanceStatus === 'insufficient';

  // Deposit button is disabled when: loading match data, player already deposited,
  // allowance is still being checked, or allowance is insufficient
  const isDisabled = isLoading || hasDeposited(matchDetails) || isCheckingAllowance || needsApproval;

  // Loading state
  if (isLoading && !matchDetails) {
    return (
      <div className="deposit-stake" data-testid="deposit-stake">
        <div className="spinner" />
        <p className="loading-message">Loading match details…</p>
      </div>
    );
  }

  // Error loading match
  if (status === 'error' && !matchDetails) {
    return (
      <div className="deposit-stake" data-testid="deposit-stake">
        <p className="feedback error" role="alert" data-testid="deposit-error">
          {errorMsg}
        </p>
        <button
          type="button"
          className="btn btn-retry"
          onClick={fetchMatchDetails}
          data-testid="retry-btn"
        >
          Retry
        </button>
      </div>
    );
  }

  // No match ID provided
  if (!matchId) {
    return null;
  }

  return (
    <div className="deposit-stake" data-testid="deposit-stake">
      <h3 className="deposit-title">Deposit Stake</h3>

      {matchDetails && (
        <div className="match-info" data-testid="match-info">
          <p>
            <span className="match-info-label">Stake Amount:</span>{' '}
            <strong>{matchDetails.stakeAmount}</strong> {matchDetails.token.toUpperCase()}
          </p>
          <p>
            <span className="match-info-label">Player 1:</span>{' '}
            <span className="address">
              {matchDetails.player1.slice(0, 4)}...{matchDetails.player1.slice(-4)}
            </span>
            <span
              className={`status-indicator ${matchDetails.player1Deposited ? 'deposited' : 'pending'}`}
              data-testid="player1-status"
            >
              {matchDetails.player1Deposited ? '✓ Deposited' : 'Pending'}
            </span>
          </p>
          <p>
            <span className="match-info-label">Player 2:</span>{' '}
            <span className="address">
              {matchDetails.player2.slice(0, 4)}...{matchDetails.player2.slice(-4)}
            </span>
            <span
              className={`status-indicator ${matchDetails.player2Deposited ? 'deposited' : 'pending'}`}
              data-testid="player2-status"
            >
              {matchDetails.player2Deposited ? '✓ Deposited' : 'Pending'}
            </span>
          </p>
        </div>
      )}

      {/* Allowance check banner */}
      {isCheckingAllowance && (
        <p
          className="feedback info"
          role="status"
          data-testid="allowance-checking"
          aria-live="polite"
        >
          Checking token allowance…
        </p>
      )}

      {/* Approve button — shown when the escrow contract lacks spending permission */}
      {needsApproval && !hasDeposited(matchDetails) && (
        <>
          <p
            className="feedback warning"
            role="note"
            data-testid="allowance-warning"
            aria-live="polite"
          >
            The escrow contract is not approved to spend your tokens. Approve it first, then
            deposit.
          </p>
          <button
            type="button"
            className="btn btn-approve"
            onClick={handleApprove}
            disabled={isApproving || isLoading}
            data-testid="approve-btn"
            aria-busy={isApproving}
          >
            {isApproving ? 'Approving…' : 'Approve Token'}
          </button>
        </>
      )}

      <button
        type="button"
        className="btn btn-deposit"
        onClick={handleDeposit}
        disabled={isDisabled}
        data-testid="deposit-btn"
        aria-busy={isPending}
      >
        {isPending
          ? 'Depositing…'
          : hasDeposited(matchDetails)
            ? 'Already Deposited'
            : isCheckingAllowance
              ? 'Checking allowance…'
              : 'Deposit Stake'}
      </button>

      {/* Success */}
      {status === 'success' && (
        <p className="feedback success" role="status" data-testid="deposit-success">
          Deposit successful!
          {txHash && (
            <span className="tx-hash" data-testid="deposit-tx-hash">
              Tx: {txHash.slice(0, 8)}...{txHash.slice(-8)}
            </span>
          )}
        </p>
      )}

      {/* Error */}
      {status === 'error' && matchDetails && (
        <p className="feedback error" role="alert" data-testid="deposit-error-msg">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

export default DepositStake;
