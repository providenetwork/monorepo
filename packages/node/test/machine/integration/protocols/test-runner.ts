import IdentityApp from "@counterfactual/cf-funding-protocol-contracts/build/IdentityApp.json";
import { OutcomeType } from "@counterfactual/types";
import { Contract, ContractFactory } from "ethers";
import { One, Two, Zero } from "ethers/constants";
import { BigNumber, getAddress } from "ethers/utils";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../../../src/constants";
import { Protocol, xkeyKthAddress } from "../../../../src/machine";
import { sortAddresses } from "../../../../src/machine/xkeys";
import { getBalancesFromFreeBalanceAppInstance } from "../../../../src/models/free-balance";
import { getCreate2MultisigAddress } from "../../../../src/utils";

import { toBeEq } from "../bignumber-jest-matcher";
import { connectToGanache } from "../connect-ganache";
import { MessageRouter } from "../message-router";
import { MiniNode } from "../mininode";

const TEST_TOKEN_ADDRESS = getAddress(
  "88a5c2d9919e46f883eb62f7b8dd9d0cc45bc290"
);

expect.extend({ toBeEq });

export enum Participant {
  A,
  B,
  C
}

export class TestRunner {
  private identityApp!: Contract;
  private mininodeA!: MiniNode;
  private mininodeB!: MiniNode;
  private mininodeC!: MiniNode;
  private multisigAB!: string;
  private multisigBC!: string;
  private mr!: MessageRouter;

  async connectToGanache() {
    const [provider, wallet, {}] = await connectToGanache();
    const network = global["networkContext"];

    this.identityApp = await new ContractFactory(
      IdentityApp.abi,
      IdentityApp.bytecode,
      wallet
    ).deploy();

    this.mininodeA = new MiniNode(network, provider);
    this.mininodeB = new MiniNode(network, provider);
    this.mininodeC = new MiniNode(network, provider);

    this.multisigAB = getCreate2MultisigAddress(
      [this.mininodeA.xpub, this.mininodeB.xpub],
      network.ProxyFactory,
      network.MinimumViableMultisig
    );

    this.multisigBC = getCreate2MultisigAddress(
      [this.mininodeB.xpub, this.mininodeC.xpub],
      network.ProxyFactory,
      network.MinimumViableMultisig
    );

    expect(this.multisigBC);

    this.mr = new MessageRouter([this.mininodeA, this.mininodeB, this.mininodeC]);
  }

  async setup() {
    this.mininodeA.scm = await this.mininodeA.ie.runSetupProtocol({
      initiatorXpub: this.mininodeA.xpub,
      responderXpub: this.mininodeB.xpub,
      multisigAddress: this.multisigAB
    });

    await this.mr.waitForAllPendingPromises();
  }

  /*
  Adds one ETH and one TEST_TOKEN to the free balance of everyone. Note this
  does not actually transfer any tokens.
  */
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
