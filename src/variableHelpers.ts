import { getItemIds, getState, setState, whenSettingStates } from "repond";
import { repondEventsMeta } from "./meta";

export function setVariable(name: string, value: any, scope: string = "global", options: { isFast?: boolean } = {}) {
  const { isFast } = options;

  let scopeIsChain = false;
  let scopeIsFastChain = false;

  if (!isFast) {
    // Non-fast case
    const chainIds = getItemIds("chains");
    if (scope !== "global" && chainIds.includes(scope)) {
      // Scope is a chain
      scopeIsChain = true;
      // Save to chain's variablesByName in state
      whenSettingStates(() => {
        const variablesByName = getState("chains", scope)?.variablesByName || {};
        setState(`chains.variablesByName`, { ...variablesByName, [name]: value }, scope);
      });
    }
  } else {
    // Fast case
    if (scope !== "global" && scope in repondEventsMeta.fastChain.nowFastChainsInfoMap) {
      // Scope is a fast chain
      scopeIsFastChain = true;
      // Save to chain's variablesMap in meta
      repondEventsMeta.fastChain.nowFastChainsInfoMap[scope].variablesMap[name] = value;
    }
  }

  if (!scopeIsChain && !scopeIsFastChain) {
    // Save to variablesByScopesMap[scope] in meta
    if (!repondEventsMeta.variablesByScopesMap[scope]) {
      repondEventsMeta.variablesByScopesMap[scope] = {};
    }
    const variablesForScope = repondEventsMeta.variablesByScopesMap[scope];
    variablesForScope[name] = value;
  }
}

function findVariableInScope(name: string, scope: string = "global", startIsFast: boolean = false) {
  let foundVariable: any = undefined;

  if (scope !== "global") {
    if (startIsFast) {
      // Search in the fast chains' meta
      let fastChainId: string | null = scope;
      while (fastChainId) {
        const fastChainInfo = repondEventsMeta.fastChain.nowFastChainsInfoMap[fastChainId];
        if (fastChainInfo && fastChainInfo.variablesMap && name in fastChainInfo.variablesMap) {
          foundVariable = fastChainInfo.variablesMap[name];
          break;
        }
        fastChainId = fastChainInfo ? fastChainInfo.parentFastChainId : null;
      }
    }

    // continue searching in non-fast chains, or start from the root non-fast chain
    const rootNonFastChainId = startIsFast ? repondEventsMeta.fastChain.nowRootFastChainParentId : null;

    // Search in the chain's state
    let chainId: string | null = rootNonFastChainId ?? scope;
    while (chainId) {
      const chainState = getState("chains", chainId);
      if (chainState && chainState.variablesByName && name in chainState.variablesByName) {
        foundVariable = chainState.variablesByName[name];
        break;
      }
      chainId = chainState ? chainState.parentChainId : null;
    }
  }

  if (foundVariable === undefined) {
    // Search in named scopes, defaulting to global
    const foundScopeMap = repondEventsMeta.variablesByScopesMap[scope];
    if (foundScopeMap && name in foundScopeMap) {
      foundVariable = foundScopeMap[name];
    }
  }

  return foundVariable;
}

export function getVariable(name: string, scope: string = "global", options: { isFast?: boolean } = {}) {
  const { isFast } = options;

  return findVariableInScope(name, scope, isFast);
}
