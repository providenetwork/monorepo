import IdentityApp from "@counterfactual/cf-funding-protocol-contracts/build/IdentityApp.json";
import { OutcomeType } from "@counterfactual/types";
import { Contract, ContractFactory, Wallet } from "ethers";
import { One, Two, Zero } from "ethers/constants";
import { JsonRpcProvider } from "ethers/providers";
import { BigNumber, getAddress } from "ethers/utils";

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

enum Participant {
  A,
  B
}

class TestRunner {
  private readonly wallet!: Wallet;
  private identityApp!: Contract;
  private mininodeA!: MiniNode;
  private mininodeB!: MiniNode;
  private multisigAB!: string;
  private mr!: MessageRouter;

  async connectToGanache() {
    let provider!: JsonRpcProvider;
    [provider, this.wallet, {}] = await connectToGanache();
    const network = global["networkContext"];

    this.identityApp = await new ContractFactory(
      IdentityApp.abi,
      IdentityApp.bytecode,
      this.wallet
    ).deploy();

    this.mininodeA = new MiniNode(network, provider);
    this.mininodeB = new MiniNode(network, provider);

    this.multisigAB = getCreate2MultisigAddress(
      [this.mininodeA.xpub, this.mininodeB.xpub],
      network.ProxyFactory,
      network.MinimumViableMultisig
    );

    this.mr = new MessageRouter([this.mininodeA, this.mininodeB]);
  }

  async setup() {
    this.mininodeA.scm = await this.mininodeA.ie.runSetupProtocol({
      initiatorXpub: this.mininodeA.xpub,
      responderXpub: this.mininodeB.xpub,
      multisigAddress: this.multisigAB
    });

    await this.mr.waitForAllPendingPromises();
  }

  async unsafeFund() {
    for (const sc of this.mininodeA.scm) {
      this.mininodeA.scm.set(
        sc[0],
        sc[1].incrementFreeBalance({
          [CONVENTION_FOR_ETH_TOKEN_ADDRESS]: {
            [sc[1].getFreeBalanceAddrOf(this.mininodeA.xpub)]: One,
            [sc[1].getFreeBalanceAddrOf(this.mininodeB.xpub)]: One
          },
          [TEST_TOKEN_ADDRESS]: {
            [sc[1].getFreeBalanceAddrOf(this.mininodeA.xpub)]: One,
            [sc[1].getFreeBalanceAddrOf(this.mininodeB.xpub)]: One
          }
        })
      );
    }
    for (const sc of this.mininodeB.scm) {
      this.mininodeB.scm.set(
        sc[0],
        sc[1].incrementFreeBalance({
          [CONVENTION_FOR_ETH_TOKEN_ADDRESS]: {
            [sc[1].getFreeBalanceAddrOf(this.mininodeA.xpub)]: One,
            [sc[1].getFreeBalanceAddrOf(this.mininodeB.xpub)]: One
          },
          [TEST_TOKEN_ADDRESS]: {
            [sc[1].getFreeBalanceAddrOf(this.mininodeA.xpub)]: One,
            [sc[1].getFreeBalanceAddrOf(this.mininodeB.xpub)]: One
          }
        })
      );
    }
  }

  async installEqualDeposits(outcomeType: OutcomeType, tokenAddress: string) {
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
          to: xkeyKthAddress(this.mininodeA.xpub, 0),
          amount: Two
        },
        {
          to: xkeyKthAddress(this.mininodeB.xpub, 0),
          amount: Zero
        }
      ],
      [OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER]: [
        [
          {
            to: xkeyKthAddress(this.mininodeA.xpub, 0),
            amount: Two
          },
          {
            to: xkeyKthAddress(this.mininodeB.xpub, 0),
            amount: Zero
          }
        ]
      ]
    }[outcomeType];

    const participants = sortAddresses([
      xkeyKthAddress(this.mininodeA.xpub, 1),
      xkeyKthAddress(this.mininodeB.xpub, 1)
    ]);

    await this.mininodeA.ie.initiateProtocol(
      Protocol.Install,
      this.mininodeA.scm,
      {
        participants,
        outcomeType,
        initialState,
        initiatorXpub: this.mininodeA.xpub,
        responderXpub: this.mininodeB.xpub,
        multisigAddress: this.multisigAB,
        initiatorBalanceDecrement: One,
        responderBalanceDecrement: One,
        appInterface: {
          stateEncoding,
          addr: this.identityApp.address,
          actionEncoding: undefined
        },
        defaultTimeout: 40,
        initiatorDepositTokenAddress: tokenAddress,
        responderDepositTokenAddress: tokenAddress
      }
    );
  }

  async installSplitDeposits(
    outcomeType: OutcomeType,
    tokenAddressA: string,
    tokenAddressB: string
  ) {
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
          to: xkeyKthAddress(this.mininodeA.xpub, 0),
          amount: Two
        },
        {
          to: xkeyKthAddress(this.mininodeB.xpub, 0),
          amount: Zero
        }
      ],
      [OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER]: [
        [
          {
            to: xkeyKthAddress(this.mininodeA.xpub, 0),
            amount: Two
          },
          {
            to: xkeyKthAddress(this.mininodeB.xpub, 0),
            amount: Zero
          }
        ]
      ]
    }[outcomeType];

    const participants = sortAddresses([
      xkeyKthAddress(this.mininodeA.xpub, 1),
      xkeyKthAddress(this.mininodeB.xpub, 1)
    ]);

    await this.mininodeA.ie.initiateProtocol(
      Protocol.Install,
      this.mininodeA.scm,
      {
        participants,
        outcomeType,
        initialState,
        initiatorXpub: this.mininodeA.xpub,
        responderXpub: this.mininodeB.xpub,
        multisigAddress: this.multisigAB,
        initiatorBalanceDecrement: One,
        responderBalanceDecrement: One,
        appInterface: {
          stateEncoding,
          addr: this.identityApp.address,
          actionEncoding: undefined
        },
        defaultTimeout: 40,
        initiatorDepositTokenAddress: tokenAddressA,
        responderDepositTokenAddress: tokenAddressB
      }
    );
  }

  async uninstall() {
    const appInstances = this.mininodeA.scm.get(this.multisigAB)!.appInstances;

    const [key] = [...appInstances.keys()].filter(key => {
      return (
        key !==
        this.mininodeA.scm.get(this.multisigAB)!.freeBalance.identityHash
      );
    });

    await this.mininodeA.ie.initiateProtocol(
      Protocol.Uninstall,
      this.mininodeA.scm,
      {
        appIdentityHash: key,
        initiatorXpub: this.mininodeA.xpub,
        responderXpub: this.mininodeB.xpub,
        multisigAddress: this.multisigAB
      }
    );

    await this.mr.waitForAllPendingPromises();
  }

  assertFB(
    participant: Participant,
    tokenAddress: string,
    expected: BigNumber
  ) {
    const mininode = {
      [Participant.A]: this.mininodeA,
      [Participant.B]: this.mininodeB
    }[participant];
    expect(
      getBalancesFromFreeBalanceAppInstance(
        mininode.scm.get(this.multisigAB)!.freeBalance,
        tokenAddress
      )[xkeyKthAddress(mininode.xpub, 0)]
    ).toBeEq(expected);
  }
}

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

  // MULTI,ETH/ERC20: TODO

  it("MULTI,SPLIT", async () => {
    await runSplitDepositTests(
      OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER,
      CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      TEST_TOKEN_ADDRESS
    );
  });
});
