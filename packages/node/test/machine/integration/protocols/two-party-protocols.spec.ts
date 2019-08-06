import { OutcomeType } from "@counterfactual/types";
import { Two, Zero } from "ethers/constants";
import { getAddress } from "ethers/utils";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../../../src/constants";
import { toBeEq } from "../bignumber-jest-matcher";
import { TestRunner, Participant } from "./test-runner";

const TEST_TOKEN_ADDRESS = getAddress(
  "88a5c2d9919e46f883eb62f7b8dd9d0cc45bc290"
);

expect.extend({ toBeEq });

async function runEqualDepositTests(
  outcomeType: OutcomeType,
  tokenAddress: string
) {
  const tr = new TestRunner();
  await tr.connectToGanache();

  await tr.setup();
  await tr.unsafeFund();
  await tr.installEqualDeposits(outcomeType, tokenAddress);
  tr.assertFB(Participant.A, tokenAddress, Zero);
  tr.assertFB(Participant.B, tokenAddress, Zero);
  await tr.uninstall();
  tr.assertFB(Participant.A, tokenAddress, Two);
  tr.assertFB(Participant.B, tokenAddress, Zero);
}

async function runSplitDepositTests(
  outcomeType: OutcomeType,
  tokenAddressA: string,
  tokenAddressB: string
) {
  const tr = new TestRunner();
  await tr.connectToGanache();

  await tr.setup();
  await tr.unsafeFund();
  await tr.installSplitDeposits(outcomeType, tokenAddressA, tokenAddressB);
  tr.assertFB(Participant.A, tokenAddressA, Zero);
  tr.assertFB(Participant.B, tokenAddressB, Zero);
  await tr.uninstall();
  tr.assertFB(Participant.A, tokenAddressA, Two);
  tr.assertFB(Participant.B, tokenAddressB, Zero);
}

describe("Install-Uninstall tests", () => {
  it("TWO_PARTY_FIXED_OUTCOME,ETH/ETH", async () => {
    await runEqualDepositTests(
      OutcomeType.TWO_PARTY_FIXED_OUTCOME,
      CONVENTION_FOR_ETH_TOKEN_ADDRESS
    );
  });

  // TWO_PARTY_FIXED,ETH/ERC20: NOT ALLOWED

  it("TWO_PARTY_FIXED_OUTCOME,ERC20/ERC20", async () => {
    await runEqualDepositTests(
      OutcomeType.TWO_PARTY_FIXED_OUTCOME,
      TEST_TOKEN_ADDRESS
    );
  });

  it("SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,ETH/ETH", async () => {
    await runEqualDepositTests(
      OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
      CONVENTION_FOR_ETH_TOKEN_ADDRESS
    );
  });
  it("SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,ERC20/ERC20", async () => {
    await runEqualDepositTests(
      OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
      TEST_TOKEN_ADDRESS
    );
  });

  // SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,ETH/ERC20: NOT ALLOWED

  it("MULTI,ETH", async () => {
    await runEqualDepositTests(
      OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER,
      CONVENTION_FOR_ETH_TOKEN_ADDRESS
    );
  });
  it("MULTI,ERC20", async () => {
    await runEqualDepositTests(
      OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER,
      TEST_TOKEN_ADDRESS
    );
  });
  it("MULTI,SPLIT", async () => {
    await runSplitDepositTests(
      OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER,
      CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      TEST_TOKEN_ADDRESS
    );
  });
});
