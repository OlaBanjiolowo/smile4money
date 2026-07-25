import React, { useState, useCallback } from 'react';
import { Address, Networks } from '@stellar/stellar-sdk';

type Platform = 'lichess' | 'chesscom';
type TokenType = 'xlm' | 'usdc';
type Status = 'idle' | 'pending' | 'success' | 'error';

interface CreateMatchProps {
  contractId: string;
  player1Address: string | null;
  networkPassphrase?: string;
  rpcUrl?: string;
  knownGameIds?: string[];
  onCreateMatch?: (data: {
    player2: string;
    stakeAmount: string;
    token: TokenType;
    gameId: string;
    platform: Platform;
  }) => Promise<string>;
}

interface FormData {
  player2: string;
  stakeAmount: string;
  gameId: string;
  platform: Platform;
}

interface FormErrors {
  player2?: string;
  stakeAmount?: string;
  gameId?: string;
}

const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

const TOKEN_ADDRESSES: Record<TokenType, string> = {
  xlm: 'native',
  usdc: '', // Would be populated from env/config
};

function isValidStellarAddress(address: string): boolean {
  try {
    Address.fromString(address);
    return true;
  } catch {
    return false;
  }
}

function validateForm(data: FormData, knownGameIds: string[] = []): FormErrors {
  const errors: FormErrors = {};

  if (!data.player2.trim()) {
    errors.player2 = 'Player 2 address is required';
  } else if (!isValidStellarAddress(data.player2)) {
    errors.player2 = 'Invalid Stellar address';
  }

  if (!data.stakeAmount.trim()) {
    errors.stakeAmount = 'Stake amount is required';
  } else {
    const amount = Number(data.stakeAmount);
    if (isNaN(amount) || amount <= 0) {
      errors.stakeAmount = 'Stake amount must be a positive number';
    }
  }

  if (!data.gameId.trim()) {
    errors.gameId = 'Game ID is required';
  } else if (data.gameId.length > 64) {
    errors.gameId = 'Game ID must be 64 characters or fewer';
  } else if (knownGameIds.includes(data.gameId.trim())) {
    errors.gameId = 'A match with this game ID already exists';
  }

  return errors;
}

export function CreateMatch({
  contractId,
  player1Address,
  networkPassphrase = Networks.TESTNET,
  rpcUrl = 'https://soroban-testnet.stellar.org',
  knownGameIds = [],
  onCreateMatch,
}: CreateMatchProps) {
  const [formData, setFormData] = useState<FormData>({
    player2: '',
    stakeAmount: '',
    gameId: '',
    platform: 'lichess',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<Status>('idle');
  const [token, setToken] = useState<TokenType>('xlm');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  function updateField(key: 'player2' | 'stakeAmount' | 'gameId' | 'platform', value: string) {
    const next = { ...formData, [key]: value } as FormData;
    setFormData(next);
    // Clear error for this field when user types
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function validateAndUpdate(
    key: 'player2' | 'stakeAmount' | 'gameId' | 'platform',
    value: string,
  ) {
    const next = { ...formData, [key]: value } as FormData;
    setFormData(next);
    const validationErrors = validateForm(next, knownGameIds);
    setErrors((prev) => ({ ...prev, [key]: validationErrors[key as keyof FormErrors] }));
  }

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const validationErrors = validateForm(formData, knownGameIds);
      setErrors(validationErrors);

      if (Object.keys(validationErrors).length > 0) {
        return;
      }

      if (!player1Address) {
        setErrorMsg('Please connect your wallet first');
        setStatus('error');
        return;
      }

      setStatus('pending');
      setErrorMsg('');

      try {
        const result = await onCreateMatch?.({
          player2: formData.player2,
          stakeAmount: formData.stakeAmount,
          token,
          gameId: formData.gameId,
          platform: formData.platform,
        });

        if (result) {
          setMatchId(result);
          setStatus('success');
        } else {
          throw new Error('Failed to create match');
        }
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Failed to create match');
      }
    },
    [formData, player1Address, token, onCreateMatch],
  );

  function resetForm() {
    setFormData({
      player2: '',
      stakeAmount: '',
      gameId: '',
      platform: 'lichess',
    });
    setErrors({});
    setStatus('idle');
    setMatchId(null);
    setErrorMsg('');
  }

  const isSubmitting = status === 'pending';
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="create-match" data-testid="create-match">
      <h2 className="create-match-title">Create New Match</h2>

      {matchId && (
        <div className="match-result" data-testid="match-success">
          <p className="success-message">Match created successfully!</p>
          <p className="match-id">
            Match ID: <strong>{matchId}</strong>
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetForm}
            data-testid="create-another-btn"
          >
            Create Another Match
          </button>
        </div>
      )}

      {!matchId && (
        <form onSubmit={handleSubmit} noValidate data-testid="create-match-form">
          {/* Token selector */}
          <div className="form-group">
            <label>Stake Token</label>
            <div className="token-toggle" role="group" aria-label="Select token">
              <button
                type="button"
                className={`toggle-btn${token === 'xlm' ? ' active' : ''}`}
                onClick={() => setToken('xlm')}
                aria-pressed={token === 'xlm'}
                data-testid="toggle-xlm"
              >
                XLM
              </button>
              <button
                type="button"
                className={`toggle-btn${token === 'usdc' ? ' active' : ''}`}
                onClick={() => setToken('usdc')}
                aria-pressed={token === 'usdc'}
                data-testid="toggle-usdc"
              >
                USDC
              </button>
            </div>
          </div>

          {/* Player 2 Address */}
          <div className="form-group">
            <label htmlFor="player2-address">Player 2 Address</label>
            <input
              id="player2-address"
              type="text"
              value={formData.player2}
              onChange={(e) => validateAndUpdate('player2', e.target.value)}
              placeholder="G..."
              disabled={isSubmitting}
              data-testid="player2-input"
              aria-invalid={!!errors.player2}
            />
            {errors.player2 && (
              <span className="error-message" data-testid="player2-error">
                {errors.player2}
              </span>
            )}
          </div>

          {/* Stake Amount */}
          <div className="form-group">
            <label htmlFor="stake-amount">Stake Amount ({token.toUpperCase()})</label>
            <input
              id="stake-amount"
              type="number"
              min="0"
              step="any"
              value={formData.stakeAmount}
              onChange={(e) => validateAndUpdate('stakeAmount', e.target.value)}
              disabled={isSubmitting}
              placeholder="0.00"
              data-testid="stake-amount-input"
              aria-invalid={!!errors.stakeAmount}
            />
            {errors.stakeAmount && (
              <span className="error-message" data-testid="stake-amount-error">
                {errors.stakeAmount}
              </span>
            )}
          </div>

          {/* Game ID */}
          <div className="form-group">
            <label htmlFor="game-id">Game ID</label>
            <input
              id="game-id"
              type="text"
              value={formData.gameId}
              onChange={(e) => updateField('gameId', e.target.value)}
              disabled={isSubmitting}
              placeholder="Enter game ID from platform"
              data-testid="game-id-input"
              aria-invalid={!!errors.gameId}
            />
            {errors.gameId && (
              <span className="error-message" data-testid="game-id-error">
                {errors.gameId}
              </span>
            )}
          </div>

          {/* Platform Selector */}
          <div className="form-group">
            <label>Platform</label>
            <div className="platform-selector" role="group" aria-label="Select platform">
              <button
                type="button"
                className={`platform-btn${formData.platform === 'lichess' ? ' active' : ''}`}
                onClick={() => updateField('platform', 'lichess')}
                aria-pressed={formData.platform === 'lichess'}
                data-testid="platform-lichess"
              >
                Lichess
              </button>
              <button
                type="button"
                className={`platform-btn${formData.platform === 'chesscom' ? ' active' : ''}`}
                onClick={() => updateField('platform', 'chesscom')}
                aria-pressed={formData.platform === 'chesscom'}
                data-testid="platform-chesscom"
              >
                Chess.com
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-submit"
            disabled={isSubmitting || hasErrors}
            data-testid="submit-match-btn"
            aria-busy={isSubmitting}
          >
            {isSubmitting ? 'Creating Match…' : 'Create Match'}
          </button>

          {/* Error Message */}
          {status === 'error' && (
            <p className="feedback error" role="alert" data-testid="create-match-error">
              {errorMsg}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

export default CreateMatch;
