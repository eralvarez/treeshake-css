# ealvarez-treeshakecss

CLI Tool to tree-shake unused CSS.

## Installation

```shell
> npm install ealvarez-treeshakecss
```

## Usage

| Arg | Description | Example |
| --- | --- | --- |
| `css` | CSS file or folder | `--css build/css/styles.css` or `--css build/css/` |
| `content` | All other files but CSS | `--content build/Button.js` or `--content build/` |
| `safelist` | Comma separated CSS class list that will not be deleted | `elevation-2,elevation-3` |

Full usage example:

```shell
ealvarez-treeshakecss --css build/css/styles.css --content build/ --safelist elevation-2,elevation-3
```