import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import axios from 'axios';
import validateGameRouter from '../src/routes/validate-game.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/validate-game', validateGameRouter);
  return app;
};

const BASE_LICHESS_GAME = {
  id: 'abc123',
  status: 'mate',
  winner: 'white',
  players: {
    white: { user: { name: 'alice' } },
    black: { user: { name: 'bob' } },
  },
};

const makeChessGame = (gameId: string, whiteResult: string, blackResult: string) => ({
  url: `https://www.chess.com/game/live/${gameId}`,
  pgn: '',
  time_control: '600',
  end_time: 0,
  white: { username: 'alice', result: whiteResult },
  black: { username: 'bob', result: blackResult },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/validate-game', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  it('returns 400 when request body is not JSON object', async () => {
    const response = await request(app).post('/api/validate-game').send('not-an-object');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Request body must be JSON');
  });

  it('returns 400 when gameId is missing', async () => {
    const response = await request(app)
      .post('/api/validate-game')
      .send({ platform: 'lichess' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('gameId is required');
  });

  it('returns 400 when gameId is empty string', async () => {
    const response = await request(app)
      .post('/api/validate-game')
      .send({ gameId: '', platform: 'lichess' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('gameId is required');
  });

  it('returns 400 when gameId is too long', async () => {
    const longId = 'a'.repeat(512);
    const response = await request(app)
      .post('/api/validate-game')
      .send({ gameId: longId, platform: 'lichess' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('gameId is too long');
  });

  it('returns 400 when platform is missing', async () => {
    const response = await request(app)
      .post('/api/validate-game')
      .send({ gameId: 'abc123' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('platform must be lichess or chessdotcom');
  });

  it('returns 400 when platform is invalid', async () => {
    const response = await request(app)
      .post('/api/validate-game')
      .send({ gameId: 'abc123', platform: 'unknown' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('platform must be lichess or chessdotcom');
  });

  describe('lichess validation', () => {
    it('returns 200 with valid=true and game info when lichess game exists', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        status: 200,
        data: BASE_LICHESS_GAME,
      });

      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'abc123', platform: 'lichess' });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.platform).toBe('lichess');
      expect(response.body.gameId).toBe('abc123');
      expect(response.body.status).toBe('mate');
      expect(response.body.whitePlayer).toBe('alice');
      expect(response.body.blackPlayer).toBe('bob');
      expect(response.body.result).toBe('Player1Wins');
    });

    it('returns 200 with valid=true for in-progress lichess game (result null)', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        status: 200,
        data: { ...BASE_LICHESS_GAME, status: 'started', winner: undefined },
      });

      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'abc123', platform: 'lichess' });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.result).toBeNull();
    });

    it('returns 404 with valid=false when lichess game is not found', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ status: 404, data: {} });

      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'missing', platform: 'lichess' });

      expect(response.status).toBe(404);
      expect(response.body.valid).toBe(false);
      expect(response.body.platform).toBe('lichess');
      expect(response.body.gameId).toBe('missing');
      expect(response.body.message).toContain('not found');
    });

    it('returns 500 with valid=false on lichess API unexpected error', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ status: 429, data: {} });

      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'abc123', platform: 'lichess' });

      expect(response.status).toBe(500);
      expect(response.body.valid).toBe(false);
      expect(response.body.message).toContain('Validation failed');
    });
  });

  describe('chessdotcom validation', () => {
    it('returns 400 when username is missing for chessdotcom', async () => {
      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'game42', platform: 'chessdotcom' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('username is required');
    });

    it('returns 400 when username is empty string for chessdotcom', async () => {
      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'game42', platform: 'chessdotcom', username: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('username is required');
    });

    it('returns 200 with valid=true when chess.com game exists in player archives', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        status: 200,
        data: { games: [makeChessGame('game42', 'win', 'resigned')] },
      });

      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'game42', platform: 'chessdotcom', username: 'alice' });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.platform).toBe('chessdotcom');
      expect(response.body.gameId).toBe('game42');
      expect(response.body.whitePlayer).toBe('alice');
      expect(response.body.blackPlayer).toBe('bob');
      expect(response.body.result).toBe('Player1Wins');
    });

    it('returns 200 with valid=true for in-progress chess.com game', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        status: 200,
        data: { games: [makeChessGame('game42', 'in_progress', 'in_progress')] },
      });

      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'game42', platform: 'chessdotcom', username: 'alice' });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.result).toBeNull();
      expect(response.body.status).toBe('in_progress');
    });

    it('returns 404 with valid=false when chess.com game not in archives', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        status: 200,
        data: { games: [] },
      });

      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'missing', platform: 'chessdotcom', username: 'alice' });

      expect(response.status).toBe(404);
      expect(response.body.valid).toBe(false);
      expect(response.body.platform).toBe('chessdotcom');
      expect(response.body.gameId).toBe('missing');
      expect(response.body.message).toContain('not found');
    });

    it('returns 500 with valid=false on chess.com API error', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ status: 500, data: {} });

      const response = await request(app)
        .post('/api/validate-game')
        .send({ gameId: 'game42', platform: 'chessdotcom', username: 'alice' });

      expect(response.status).toBe(500);
      expect(response.body.valid).toBe(false);
      expect(response.body.message).toContain('Validation failed');
    });
  });
});
