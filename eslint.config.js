import js from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    plugins: {
      react: reactPlugin,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        React: 'readonly'
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      "no-undef": "error",
      "react/jsx-no-undef": "error"
    }
  }
];
