import { hash, verify } from "@node-rs/argon2";

export const hashPassword = async (password: string) => {
  return await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
};

export const verifyPasswordHash = async (
  passwordHash: string | null,
  password: string,
) => {
  if (!passwordHash) {
    await hashPassword(password);
    return false;
  }
  return await verify(passwordHash, password);
};
