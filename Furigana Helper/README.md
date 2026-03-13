## 🌸 RemNote Furigana Helper

![demo](./public/logo2.png)
An intelligent Japanese Furigana injector for RemNote, designed for beauty, performance, and readability.

### ✨ Features

- 🚀 **Local Dictionary** — Powered by kuromoji, runs entirely offline with no external API calls.
- 🎨 **Dual Rendering Modes** — Choose between floating LaTeX typesetting or inline bracket notation.
- 🔗 **Smart Compound Merging** — Automatically merges adjacent kanji into a single furigana block.
- ⚙️ **Fully Customizable** — Separate settings for selection mode and full-Rem mode.
- 📏 **Long Text Support** — Automatically splits long LaTeX lines to prevent screen overflow.

### 🚀 Getting Started

1. Install the plugin from the RemNote plugin marketplace.
2. Place your cursor on a Rem, or highlight a phrase.
3. Press `Alt + Shift + F` or run the command `Add Furigana`.
4. Watch your text transform!

## 📖 Usage

### 1. Annotate a Selection

Highlight any phrase with your mouse, then press `Alt + Shift + F`.
Supports both **bracket** and **LaTeX** modes.
![demo3](./public/3.gif)
Merge Compound Words
![demo4](./public/4.gif)

### 2. Annotate an Entire Rem

Place your cursor on a Rem without selecting any text, then press `Alt + Shift + F`.
Supports both **bracket** and **LaTeX** modes.
![demo1](./public/1.gif)
![demo2](./public/2.gif)
![demo6](./public/6.gif)

### 3. Batch Annotate Multiple Rems

Select multiple Rems and press `Alt + Shift + F` to annotate them all at once.
![demo5](./public/5.gif)

---

## ⚙️ Configuration

| Setting                    | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| Tiny Furigana              | Reduce furigana font size in LaTeX mode               |
| Merge Compound Words       | Merge adjacent kanji readings into a single bracket   |
| Full Conversion Style      | Choose LaTeX or bracket for full-Rem conversion       |
| Selection Conversion Style | Choose LaTeX or bracket for selection conversion      |
| Max Sentence Length        | Maximum characters per LaTeX line before forced break |

---

## 📝 Todo

- [ ] Preserve rich text formatting (bold, italic) within annotated selections
