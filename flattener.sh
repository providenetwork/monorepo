#!/bin/bash

# cleaning, setup & sanity

clean_adjudicator() {
  rm -rf ./packages/cf-adjudicator-contracts/flat
  rm -rf ./packages/cf-adjudicator-contracts/tmp
}

clean_funding_protocol() {
  rm -rf ./packages/cf-funding-protocol-contracts/flat
  rm -rf ./packages/cf-funding-protocol-contracts/tmp
}

clean_targets() {
  rm -rf ./flat
}

clean() {
  clean_adjudicator
  clean_funding_protocol
  rm -rf ./flat
}

setup() {
  echo "assuming execution from working copy of https://github.com/counterfactual/monorepo@bfd8b5593c125ebfb356b8cd98583efe9e037649"
  npm install -g truffle-flattener

  echo "ensuring sane monorepo build environment..."
  npm install

  mkdir -p ./flat
}

# cf-adjudicator-contracts

flatten_adjudicator_artifact() {

  pushd packages/cf-adjudicator-contracts
  npm install

  mkdir -p ./flat
  mkdir -p ./tmp

  cp ./contracts/*.sol tmp/
  cp ./contracts/interfaces/*.sol tmp/
  cp ./contracts/libs/*.sol tmp/
  cp ./contracts/mixins/*.sol tmp/

  cp ./node_modules/openzeppelin-solidity/contracts/cryptography/ECDSA.sol tmp/

  sed -i '' -e "s/\(import \)\(.*\)\/\(.*\).sol/import \".\/\3.sol/g" tmp/*
  truffle-flattener tmp/* | sed "/^pragma solidity/d" | sed "/^pragma experimental/d" | sed '1s/.*/pragma solidity 0.5.11;/' | sed '2s/.*/pragma experimental "ABIEncoderV2";/' > ./flat/cf-adjudicator.sol
  cat -s ./flat/cf-adjudicator.sol > ./flat/cf-adjudicator.sol.tmp && mv ./flat/cf-adjudicator.sol.tmp ./flat/cf-adjudicator.sol
  cp ./flat/cf-adjudicator.sol ../../flat/

  popd
  clean_adjudicator

  echo "Generated flattened Counterfactual Solidity file for auditing cf-adjudicator package:"
  cat ./flat/cf-adjudicator.sol
}

# cf-funding-protocol-contracts

flatten_funding_protocol_artifact() {
  pushd packages/cf-funding-protocol-contracts
  npm install

  mkdir -p ./flat
  mkdir -p ./tmp

  cp ./contracts/*.sol tmp/
  cp ./contracts/default-apps/*.sol tmp/
  # cp ./contracts/interpreters/*.sol tmp/  # TODO: in the future, make this include conditional based on the presence of "in-scope" interpreters (see below; uncomment when all interpreters are in-scope)
  cp ./contracts/libs/*.sol tmp/
  cp ./contracts/proxies/*.sol tmp/
  cp ./contracts/state-deposit-holders/*.sol tmp/

  cp ./contracts/interpreters/SingleAssetTwoPartyCoinTransferInterpreter.sol tmp/
  cp ./contracts/interpreters/SingleAssetTwoPartyCoinTransferFromVirtualAppInterpreter.sol tmp/

  cp ../cf-adjudicator-contracts/contracts/ChallengeRegistry.sol tmp/
  cp ../cf-adjudicator-contracts/contracts/interfaces/*.sol tmp/
  cp ../cf-adjudicator-contracts/contracts/libs/*.sol tmp/
  cp ../cf-adjudicator-contracts/contracts/mixins/*.sol tmp/

  cp ./node_modules/openzeppelin-solidity/contracts/cryptography/ECDSA.sol tmp/
  cp ./node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol tmp/
  cp ./node_modules/openzeppelin-solidity/contracts/token/ERC20/IERC20.sol tmp/
  cp ./node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol tmp/

  sed -i '' -e "s/\(import \)\(.*\)\/\(.*\).sol/import \".\/\3.sol/g" tmp/*
  truffle-flattener tmp/* | sed "/^pragma solidity/d" | sed "/^pragma experimental/d" | sed '1s/.*/pragma solidity 0.5.11;/' | sed '2s/.*/pragma experimental "ABIEncoderV2";/' > ./flat/cf-funding-protocol.sol
  cat -s ./flat/cf-funding-protocol.sol > ./flat/cf-funding-protocol.sol.tmp && mv ./flat/cf-funding-protocol.sol.tmp ./flat/cf-funding-protocol.sol
  cp ./flat/cf-funding-protocol.sol ../../flat/

  popd
  clean_funding_protocol

  echo "Generated flattened Counterfactual Solidity file as target for auditing cf-funding-protocol package:"
  cat ./flat/cf-funding-protocol.sol
}

main() {
  # TODO: implement basic arvg support, at a minimum, for building a specific auditing target and for optionally specifying a specific auditing target
  clean
  setup
  flatten_adjudicator_artifact
  flatten_funding_protocol_artifact
}

main
