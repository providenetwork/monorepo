import { OutcomeType } from "@counterfactual/types";
import { Two, Zero } from "ethers/constants";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../../../src/constants";
import { toBeEq } from "../bignumber-jest-matcher";

import { Participant, TestRunner } from "./test-runner";

expect.extend({ toBeEq });

export enum TokenType {
  ETH = "ETH",
  ERC20 = "ERC20",
  SPLIT = "SPLIT"
}

async function runInstallUninstallTest(
  outcomeType: OutcomeType,
  tokenType: TokenType
) {
  const tr = new TestRunner();
  await tr.connectToGanache();

  await tr.setup();
  await tr.unsafeFund();

  if (tokenType === TokenType.SPLIT) {
    await tr.installSplitDeposits(
      outcomeType,
      CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      TestRunner.TEST_TOKEN_ADDRESS
    );
    tr.assertFB(Participant.A, CONVENTION_FOR_ETH_TOKEN_ADDRESS, Zero);
    tr.assertFB(Participant.B, TestRunner.TEST_TOKEN_ADDRESS, Zero);

    await tr.uninstall();
    tr.assertFB(Participant.A, CONVENTION_FOR_ETH_TOKEN_ADDRESS, Two);
    tr.assertFB(Participant.B, TestRunner.TEST_TOKEN_ADDRESS, Zero);
  } else {
    const tokenAddress = {
      [TokenType.ETH]: CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      [TokenType.ERC20]: TestRunner.TEST_TOKEN_ADDRESS
    }[tokenType];

    await tr.installEqualDeposits(outcomeType, tokenAddress);
    tr.assertFB(Participant.A, tokenAddress, Zero);
    tr.assertFB(Participant.B, tokenAddress, Zero);
    await tr.uninstall();
    tr.assertFB(Participant.A, tokenAddress, Two);
    tr.assertFB(Participant.B, tokenAddress, Zero);
  }
}

describe("Install-Uninstall tests", () => {
  for (const outcomeType of [
    OutcomeType.TWO_PARTY_FIXED_OUTCOME,
    OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
    OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER
  ]) {
    for (const tokenType of [TokenType.ETH, TokenType.ERC20, TokenType.SPLIT]) {
      if (
        tokenType === TokenType.SPLIT &&
        outcomeType !== OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER
      ) {
        continue;
      }

      it(`${outcomeType}/${tokenType}`, async () => {
        await runInstallUninstallTest(outcomeType, tokenType);
      });
    }
  }
});
