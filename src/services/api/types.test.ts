import { ApiError } from './types';

describe('ApiError', () => {
  it('extends Error', () => {
    const error = new ApiError('test error', 500, 'test');
    expect(error).toBeInstanceOf(Error);
  });

  it('has statusCode and service properties', () => {
    const error = new ApiError('not found', 404, 'coingecko');
    expect(error.statusCode).toBe(404);
    expect(error.service).toBe('coingecko');
    expect(error.message).toBe('not found');
  });

  it('has name set to ApiError', () => {
    const error = new ApiError('oops');
    expect(error.name).toBe('ApiError');
  });
});
