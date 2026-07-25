import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { NotFound } from '../../src/pages/NotFound';

describe('NotFound page', () => {
  function renderWithRouter(initialPath = '/does-not-exist') {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <NotFound />
      </MemoryRouter>,
    );
  }

  it('renders the 404 heading and text', () => {
    renderWithRouter();
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText(/404/)).toBeInTheDocument();
  });

  it("renders a link back to the home page", () => {
    renderWithRouter();
    const link = screen.getByRole('link', { name: /back to home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('has the not-found-page test id', () => {
    renderWithRouter();
    expect(screen.getByTestId('not-found-page')).toBeInTheDocument();
  });
});
