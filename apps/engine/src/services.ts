import { EnvKeyProvider, Vault } from "@qalisa/core";
import { db } from "@qalisa/db";
import { env } from "./env";

// Composition root: build the vault from the env-sourced master key + db client.
const keyProvider = new EnvKeyProvider(env.VAULT_MASTER_KEY);

export const vault = new Vault(db, keyProvider);
