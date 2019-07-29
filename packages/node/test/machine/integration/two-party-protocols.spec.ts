import IdentityApp from "@counterfactual/contracts/build/IdentityApp.json";
import { OutcomeType } from "@counterfactual/types";
import { ContractFactory } from "ethers";
import { One, Two, Zero } from "ethers/constants";
import { getAddress } from "ethers/utils";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../../src/constants";
import { Protocol, xkeyKthAddress } from "../../../src/machine";
import { sortAddresses } from "../../../src/machine/xkeys";
import { getBalancesFromFreeBalanceAppInstance } from "../../../src/models/free-balance";
import { getCreate2MultisigAddress } from "../../../src/utils";

import { toBeEq } from "./bignumber-jest-matcher";
import { connectToGanache } from "./connect-ganache";
import { MessageRouter } from "./message-router";
import { MiniNode } from "./mininode";

const TEST_TOKEN_ADDRESS = getAddress(
  "88a5c2d9919e46f883eb62f7b8dd9d0cc45bc290"
);

expect.extend({ toBeEq });

// before each test case, create two connected MiniNodes, setup a channel
// and increment their balances of ETH and TEST_TOKEN_ADDRESS in the channel
async function runTest(outcomeType: OutcomeType, tokenAddress: string) {
  const [provider, wallet, {}] = await connectToGanache();
  const network = global["networkContext"];

  const identityApp = await new ContractFactory(
    IdentityApp.abi,
    IdentityApp.bytecode,
    wallet
  ).deploy();

  const mininodeA = new MiniNode(network, provider);
  const mininodeB = new MiniNode(network, provider);

  const multisigAB = getCreate2MultisigAddress(
    [mininodeA.xpub, mininodeB.xpub],
    network.ProxyFactory,
    network.MinimumViableMultisig
  );

  const mr = new MessageRouter([mininodeA, mininodeB]);

  const stateEncoding = {
    [OutcomeType.TWO_PARTY_FIXED_OUTCOME]: "uint8",
    [OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER]:
      "tuple(address to, uint256 amount)[2]",
    [OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER]:
      "tuple(address to, uint256 amount)[][]"
  }[outcomeType];

  const initialState = {
    [OutcomeType.TWO_PARTY_FIXED_OUTCOME]: 0,
    [OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER]: [
      {
        to: xkeyKthAddress(mininodeA.xpub, 0),
        amount: One.add(One)
      },
      {
        to: xkeyKthAddress(mininodeB.xpub, 0),
        amount: Zero
      }
    ],
    [OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER]: [
      [
        {
          to: xkeyKthAddress(mininodeA.xpub, 0),
          amount: One.add(One)
        },
        {
          to: xkeyKthAddress(mininodeB.xpub, 0),
          amount: Zero
        }
      ]
    ]
  }[outcomeType];

  mininodeA.scm = await mininodeA.ie.runSetupProtocol({
    initiatorXpub: mininodeA.xpub,
    responderXpub: mininodeB.xpub,
    multisigAddress: multisigAB
  });

  await mr.waitForAllPendingPromises();

  for (const sc of mininodeA.scm) {
    mininodeA.scm.set(
      sc[0],
      sc[1].incrementFreeBalance({
        [CONVENTION_FOR_ETH_TOKEN_ADDRESS]: {
          [sc[1].getFreeBalanceAddrOf(mininodeA.xpub)]: One,
          [sc[1].getFreeBalanceAddrOf(mininodeB.xpub)]: One
        },
        [TEST_TOKEN_ADDRESS]: {
          [sc[1].getFreeBalanceAddrOf(mininodeA.xpub)]: One,
          [sc[1].getFreeBalanceAddrOf(mininodeB.xpub)]: One
        }
      })
    );
  }
  for (const sc of mininodeB.scm) {
    mininodeB.scm.set(
      sc[0],
      sc[1].incrementFreeBalance({
        [CONVENTION_FOR_ETH_TOKEN_ADDRESS]: {
          [sc[1].getFreeBalanceAddrOf(mininodeA.xpub)]: One,
          [sc[1].getFreeBalanceAddrOf(mininodeB.xpub)]: One
        },
        [TEST_TOKEN_ADDRESS]: {
          [sc[1].getFreeBalanceAddrOf(mininodeA.xpub)]: One,
          [sc[1].getFreeBalanceAddrOf(mininodeB.xpub)]: One
        }
      })
    );
  }

  const participants = sortAddresses([
    xkeyKthAddress(mininodeA.xpub, 1),
    xkeyKthAddress(mininodeB.xpub, 1)
  ]);

  await mininodeA.ie.initiateProtocol(Protocol.Install, mininodeA.scm, {
    participants,
    outcomeType,
    initialState,
    initiatorXpub: mininodeA.xpub,
    responderXpub: mininodeB.xpub,
    multisigAddress: multisigAB,
    initiatorBalanceDecrement: One,
    responderBalanceDecrement: One,
    appInterface: {
      stateEncoding,
      addr: identityApp.address,
      actionEncoding: undefined
    },
    defaultTimeout: 40,
    initiatorDepositTokenAddress: tokenAddress,
    responderDepositTokenAddress: tokenAddress
  });

  expect(
    getBalancesFromFreeBalanceAppInstance(
      mininodeA.scm.get(multisigAB)!.freeBalance,
      tokenAddress
    )[xkeyKthAddress(mininodeA.xpub, 0)]
  ).toBeEq(Zero);
  expect(
    getBalancesFromFreeBalanceAppInstance(
      mininodeA.scm.get(multisigAB)!.freeBalance,
      tokenAddress
    )[xkeyKthAddress(mininodeB.xpub, 0)]
  ).toBeEq(Zero);

  const appInstances = mininodeA.scm.get(multisigAB)!.appInstances;

  const [key] = [...appInstances.keys()].filter(key => {
    return key !== mininodeA.scm.get(multisigAB)!.freeBalance.identityHash;
  });

  await mininodeA.ie.initiateProtocol(Protocol.Uninstall, mininodeA.scm, {
    appIdentityHash: key,
    initiatorXpub: mininodeA.xpub,
    responderXpub: mininodeB.xpub,
    multisigAddress: multisigAB
  });

  await mr.waitForAllPendingPromises();

  expect(
    getBalancesFromFreeBalanceAppInstance(
      mininodeA.scm.get(multisigAB)!.freeBalance,
      tokenAddress
    )[xkeyKthAddress(mininodeA.xpub, 0)]
  ).toBeEq(Two);
  expect(
    getBalancesFromFreeBalanceAppInstance(
      mininodeA.scm.get(multisigAB)!.freeBalance,
      tokenAddress
    )[xkeyKthAddress(mininodeB.xpub, 0)]
  ).toBeEq(Zero);
}

describe("Install-Uninstall tests", () => {
  it("direct,TWO_PARTY_FIXED_OUTCOME,ETH", async () => {
    await runTest(
      OutcomeType.TWO_PARTY_FIXED_OUTCOME,
      CONVENTION_FOR_ETH_TOKEN_ADDRESS
    );
  });
  it("direct,TWO_PARTY_FIXED_OUTCOME,ERC20", async () => {
    await runTest(OutcomeType.TWO_PARTY_FIXED_OUTCOME, TEST_TOKEN_ADDRESS);
  });
  it("direct,SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,ETH", async () => {
    await runTest(
      OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
      CONVENTION_FOR_ETH_TOKEN_ADDRESS
    );
  });
  it("direct,SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,ERC20", async () => {
    await runTest(
      OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
      TEST_TOKEN_ADDRESS
    );
  });
  it("direct,MULTI,ETH", async () => {
    await runTest(
      OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER,
      CONVENTION_FOR_ETH_TOKEN_ADDRESS
    );
  });
  it("direct,MULTI,ERC20", async () => {
    await runTest(
      OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER,
      TEST_TOKEN_ADDRESS
    );
  });
});
