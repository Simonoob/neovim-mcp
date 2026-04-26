import { dependencyFunction } from "./dependency.js";

/** the main function*/
const main = () => {
  const variable = "variable";
  return dependencyFunction(variable);
};

main();

const unusedVar = "useless";
