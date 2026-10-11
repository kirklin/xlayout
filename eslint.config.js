import kirklin from "@kirklin/eslint-config";

export default kirklin({
  type: "lib",
  typescript: true,
  react: true,
  formatters: true,
  pnpm: true,
});
