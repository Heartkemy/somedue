export const verifyArchitectureArgs = (binary, architecture) => [
  binary,
  "-verify_arch",
  architecture,
];
