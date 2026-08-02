import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DepositStake } from '../src/components/DepositStake';

// Mock @stellar/stellar-sdk
vi.mock('@stellar/stellar-sdk', () => ({
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  SorobanRpc: {
    Server: vi.fn().mockImplementation(() => ({
      sendTransaction: vi.fn(),
      getTransaction: vi.fn(),
    })),
    GetTransactionStatus: {
      PENDING: 'PENDING',
      SUCCESS: 'SUCCESS',
      ERROR: 'ERROR',
    },
  },
}));

describe('DepositStake — loading state', () => {
  it('shows loading state initially while fetching match details', () => {
    render(<DepositStake matchId="123" playerAddress="GABCDEF123456" contractId="test-contract" />);
    expect(screen.getByTestId('deposit-stake')).toBeInTheDocument();
  });
});

describe('DepositStake — no match ID', () => {
  it('returns null when no match ID provided', () => {
    const { container } = render(
      <DepositStake matchId="" playerAddress="GABCDEF123456" contractId="test-contract" />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('DepositStake — match info display', () => {
  it('displays match stake amount after mock data loads', async () => {
    render(<DepositStake matchId="123" playerAddress="GABCDEF123456" contractId="test-contract" />);

    // Wait for the mock data to be loaded
    await waitFor(() => {
      expect(screen.getByTestId('match-info')).toBeInTheDocument();
    });
  });
});

describe('DepositStake — deposit button states', () => {
  it('shows Deposit Stake button after loading', async () => {
    render(<DepositStake matchId="123" playerAddress="GABCDEF123456" contractId="test-contract" />);

    await waitFor(() => {
      expect(screen.getByTestId('deposit-btn')).toBeInTheDocument();
    });
  });

  /**
   * #1080 — Regression guard for double-submit race condition.
   *
   * While an in-flight deposit transaction is pending the button must be:
   *   - disabled (cannot be clicked again)
   *   - aria-busy="true" (accessible loading indicator)
   *   - showing the "Depositing…" label
   *
   * We use a never-resolving promise to freeze the component in the pending
   * state so we can assert all three properties synchronously.
   */
  it('disables the button and shows a loading indicator while a deposit is in flight', async () => {
    // onDeposit never resolves — keeps the component in the 'pending' state
    // for as long as we need to make assertions.
    let resolveDeposit!: () => void;
    const inFlightDeposit = new Promise<void>((resolve) => {
      resolveDeposit = resolve;
    });
    const onDeposit = vi.fn().mockReturnValue(inFlightDeposit);

    render(
      <DepositStake
        matchId="123"
        playerAddress="GABCDEF123456"
        contractId="test-contract"
        onDeposit={onDeposit}
      />,
    );

    // Wait for match details to load so the deposit button is enabled
    const depositBtn = await screen.findByTestId('deposit-btn');
    expect(depositBtn).not.toBeDisabled();

    // Trigger the deposit — this sets status to 'pending' synchronously
    fireEvent.click(depositBtn);

    // The button must be disabled while the transaction is in flight
    expect(depositBtn).toBeDisabled();

    // aria-busy must be true so screen readers announce the loading state
    expect(depositBtn).toHaveAttribute('aria-busy', 'true');

    // The label must communicate the in-progress state to sighted users
    expect(depositBtn).toHaveTextContent('Depositing…');

    // Confirm onDeposit was only called once — no double-submit
    expect(onDeposit).toHaveBeenCalledTimes(1);

    // Clean up: let the promise resolve so the component can unmount cleanly
    resolveDeposit();
  });
});

describe('DepositStake — form rendering', () => {
  it('renders with correct test id', () => {
    render(<DepositStake matchId="123" playerAddress="GABCDEF123456" contractId="test-contract" />);
    expect(screen.getByTestId('deposit-stake')).toBeInTheDocument();
  });
});

describe('DepositStake — wallet connection check', () => {
  it('handles no player address', () => {
    render(<DepositStake matchId="123" playerAddress={null} contractId="test-contract" />);
    expect(screen.getByTestId('deposit-stake')).toBeInTheDocument();
  });
});
