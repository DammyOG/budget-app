import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

const env = (process.env.PLAID_ENV || "sandbox") as keyof typeof PlaidEnvironments;

const configuration = new Configuration({
  basePath: PlaidEnvironments[env] || PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

// "transactions" is required of every institution we connect to; Link will
// refuse the connection entirely if a required product isn't supported there
// (e.g. Bank of America doesn't offer Investments, so it must not be required).
export const PLAID_PRODUCTS = (process.env.PLAID_PRODUCTS || "transactions")
  .split(",")
  .map((p) => p.trim()) as Products[];

// "investments" only applies to brokerage/retirement institutions (Robinhood,
// etc). Requested as optional so those institutions still offer it, without
// blocking banks that don't support it.
export const PLAID_OPTIONAL_PRODUCTS = (process.env.PLAID_OPTIONAL_PRODUCTS || "investments")
  .split(",")
  .map((p) => p.trim())
  .filter((p) => !PLAID_PRODUCTS.includes(p as Products)) as Products[];

export const PLAID_COUNTRY_CODES = (process.env.PLAID_COUNTRY_CODES || "US")
  .split(",")
  .map((c) => c.trim()) as CountryCode[];
