import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
