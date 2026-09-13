module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: ['<rootDir>/tests/**/*.test.ts'],
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
    },
};
