"""The version of mutint-circos itself.

An installed app contributes a version by exposing `__version__` from a `version` submodule;
`./mutint version` finds it that way, `/about` through `register_about_section` in apps.py.
`NAME` is what `./mutint version` prints and what `--component` matches.

Bump with `./mutint version --bump patch --component mutint-circos`, and tag the release
commit `v<version>` to match.
"""

NAME = "mutint-circos"

__version__ = "0.0.1"
