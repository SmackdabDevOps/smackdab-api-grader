export const createHash = jest.fn(() => ({
  update: jest.fn().mockReturnThis(),
  digest: jest.fn(() => 'mocked-hash-123')
}));

export default {
  createHash
};