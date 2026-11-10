{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
  };

  outputs = inputs:
    inputs.flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = (import (inputs.nixpkgs) { inherit system; });
      in
      {
        devShells.default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            node-gyp-build
          ];
          buildInputs = with pkgs; [
            yarn
            nodejs
            typescript
            typescript-language-server
            node-gyp
            python3
            webpack-cli
            yarn
          ];
          shellHook = ''
            yarn
          '';
        };
      }
    );
}
