"use strict";

const config = require("@bonniernews/eslint-config");

module.exports = [
  ...config,
  { rules: { "@bonniernews/typescript-rules/disallow-class-extends": "off" } },
];
