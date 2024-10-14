import { AllState, getState, setState } from "repond";
import { repondEventsMeta } from "repond-events/src/meta";

export function setVariable(name: string, value: any, scope: string = "global", options: { isFast?: boolean } = {}) {
  const { isFast } = options;

  let scopeIsChain = false;
  let scopeIsFastChain = false;

  if (!isFast) {
    // Non-fast case
    if (scope !== "global" && scope in getState().chains) {
      // Scope is a chain
      scopeIsChain = true;
      // Save to chain's variablesByName in state
      setState((state: AllState) => {
        const variablesByName = state.chains[scope]?.variablesByName || {};
        return {
          chains: {
            [scope]: {
              variablesByName: { ...variablesByName, [name]: value },
            },
          },
        };
      });
    }
  } else {
    // Fast case
    if (scope !== "global" && scope in repondEventsMeta.fastChains.nowFastChainsInfoMap) {
      // Scope is a fast chain
      scopeIsFastChain = true;
      // Save to chain's variablesMap in meta
      repondEventsMeta.fastChains.nowFastChainsInfoMap[scope].variablesMap[name] = value;
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

function findVariableInScope(name: string, scope: string = "global", isFast: boolean = false) {
  let foundVariable: any = undefined;

  if (scope !== "global") {
    if (!isFast) {
      // Search in the chain's state
      let chainId: string | null = scope;
      while (chainId) {
        const chainState = getState().chains[chainId];
        if (chainState && chainState.variablesByName && name in chainState.variablesByName) {
          foundVariable = chainState.variablesByName[name];
          break;
        }
        chainId = chainState ? chainState.parentChainId : null;
      }
    } else {
      // Search in the fast chains' meta
      let fastChainId: string | null = scope;
      while (fastChainId) {
        const fastChainInfo = repondEventsMeta.fastChains.nowFastChainsInfoMap[fastChainId];
        if (fastChainInfo && fastChainInfo.variablesMap && name in fastChainInfo.variablesMap) {
          foundVariable = fastChainInfo.variablesMap[name];
          break;
        }
        fastChainId = fastChainInfo ? fastChainInfo.parentFastChainId : null;
      }
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
