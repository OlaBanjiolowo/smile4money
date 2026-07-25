import React from 'react';

const EXPECTED_NETWORK = import.meta.env.VITE_STELLAR_NETWORK ?? 'testnet';

interface NetworkBannerProps {
  walletNetwork: string | null;
}

export function NetworkBanner({ walletNetwork }: NetworkBannerProps) {
  if (!walletNetwork || walletNetwork === EXPECTED_NETWORK) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="network-banner"
      className="w-full bg-red-600 px-4 py-3 text-center text-sm font-medium text-white"
    >
      Wrong network detected: your wallet is on <strong>{walletNetwork}</strong> but this app
      requires <strong>{EXPECTED_NETWORK}</strong>.{' '}
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        Switch network in your wallet
      </a>
      .
    </div>
  );
}
