import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../index.css'; // import <widget-name>.css
import Kuroshiro from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';

const kuroshiro = new Kuroshiro();
let initializationPromise: Promise<void> | null = null;

async function initAnalyzer(plugin: ReactRNPlugin) {
  // concurrency safe
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const originalOpen = XMLHttpRequest.prototype.open;
      (XMLHttpRequest.prototype as any).open = function (
        method: string,
        url: string,
        ...rest: any[]
      ) {
        if (typeof url === 'string' && url.includes('.dat')) {
          plugin.app.toast('XHR intercept: ' + url);
          const filename = url.split('/').pop();
          url = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/' + filename;
        }
        return originalOpen.apply(this, [method, url, ...rest] as any);
      };
      const analyzer = new KuromojiAnalyzer({
        dictPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/',
      });

      await kuroshiro.init(analyzer);

      await plugin.app.toast('Furigana Helper: Dictionary loaded ✅');
    } catch (e) {
      initializationPromise = null;
      await plugin.app.toast('Furigana Helper: Failed to load dictionary ❌');
      throw e;
    }
  })();

  return initializationPromise;
}

async function getFuriganaLatex(plugin: ReactRNPlugin, text: string): Promise<string> {
  // Ensure the kuroshiro analyzer is initialized before conversion
  await initAnalyzer(plugin);
  const useTiny = await plugin.settings.getSetting('furigana size');
  const sizeCmd = useTiny ? '\\tiny ' : '';

  const result = await kuroshiro.convert(text, { to: 'hiragana', mode: 'furigana' });

  // Clean up HTML tags and extract content
  const latex = result.replace(
    /<ruby>(?:<rp>.*?<\/rp>)?(.*?)(?:<rp>.*?<\/rp>)?<rt>(.*?)<\/rt>(?:<rp>.*?<\/rp>)?<\/ruby>/g,
    (_: string, kanji: string, furigana: string) => {
      const cleanKanji = kanji.replace(/<[^>]+>/g, '');
      if (cleanKanji === furigana) return `}\\text{${cleanKanji}}\\text{`;
      return `}\\overset{${sizeCmd}\\text{${furigana}}}{\\text{${cleanKanji}}}\\text{`;
    }
  );

  return `\\text{${latex}}`.replace(/\\text\{\}/g, '');
}

async function getFuriganaBrackets(plugin: ReactRNPlugin, text: string): Promise<string> {
  await initAnalyzer(plugin);
  const shouldMerge = (await plugin.settings.getSetting('merge compounds')) ?? true;

  const userBrackets: string[] = [];
  //Protect existing furigana brackets in the original text (e.g. 例（たとえ）)
  // to prevent them from being accidentally merged later.

  const protectedText = text.replace(/[一-龠々]+[（(][ぁ-ゔァ-ヴー]+[）)]/g, (match) => {
    userBrackets.push(match);
    return `__PROTECTED_${userBrackets.length - 1}__`;
  });

  const rawResult = await kuroshiro.convert(protectedText, {
    to: 'hiragana',
    mode: 'okurigana',
  });

  let result = rawResult.replace(/<[^>]+>/g, '');

  if (shouldMerge) {
    result = result.replace(/(([一-龠々]+)[（(]([ぁ-ゔァ-ヴー]+)[）)])+/g, (match: string) => {
      let fullK = '',
        fullF = '';
      const re = /([一-龠々]+)[（(]([ぁ-ゔァ-ヴー]+)[）)]/g;
      let m;
      while ((m = re.exec(match)) !== null) {
        fullK += m[1];
        fullF += m[2];
      }
      return `${fullK}（${fullF}）`;
    });
  }
  result = result.replace(
    /([一-龠々]+)[（(]([^）)]+)[）)]/g,
    (match: string, k: string, f: string) => {
      if (k === f) return k;
      return match;
    }
  );

  // Restore the original brackets that were protected in the first step
  result = result.replace(
    /__PROTECTED_(\d+)__/g,
    (_: string, i: string) => userBrackets[parseInt(i)]
  );

  return result;
}

async function processLongTextToLatex(plugin: ReactRNPlugin, rawText: string): Promise<any[]> {
  const MAX_THRESHOLD = ((await plugin.settings.getSetting('max threshold')) as number) || 30;
  const allParts = rawText.split(/([。、！？\n])/g).filter((p) => p !== '');
  const richTextArray: any[] = [];
  let currentBuffer = '';

  for (let i = 0; i < allParts.length; i++) {
    const part = allParts[i];
    const isSentenceEnd = /[。！？\n]/.test(part);

    if (currentBuffer.length + part.length > MAX_THRESHOLD) {
      if (currentBuffer.length > 0) {
        const latex = await getFuriganaLatex(plugin, currentBuffer);
        richTextArray.push({ i: 'x', text: latex, block: false });
        currentBuffer = '';
      }

      if (part.length > MAX_THRESHOLD) {
        let remaining = part;
        while (remaining.length > MAX_THRESHOLD) {
          const slice = remaining.slice(0, MAX_THRESHOLD);
          richTextArray.push({ i: 'x', text: await getFuriganaLatex(plugin, slice), block: false });
          remaining = remaining.slice(MAX_THRESHOLD);
        }
        currentBuffer = remaining;
      } else {
        currentBuffer = part;
      }
    } else {
      currentBuffer += part;
      // greedy
      if (isSentenceEnd && currentBuffer.length >= MAX_THRESHOLD * 0.8) {
        richTextArray.push({
          i: 'x',
          text: await getFuriganaLatex(plugin, currentBuffer),
          block: false,
        });
        currentBuffer = '';
      }
    }
  }

  // clear buffer
  if (currentBuffer.length > 0) {
    if (currentBuffer === '\n') {
      richTextArray.push('\n');
    } else {
      const latex = await getFuriganaLatex(plugin, currentBuffer);
      richTextArray.push({ i: 'x', text: latex, block: false });
    }
  }

  return richTextArray;
}

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.settings.registerBooleanSetting({
    id: 'furigana size',
    title: 'Latex Mode: Tiny Furigana',
    description: 'Set for latex mode.',
    defaultValue: false,
  });

  await plugin.settings.registerNumberSetting({
    id: 'max threshold',
    title: 'Latex Mode: Max Sentence Length',
    description:
      'The maximum characters per LaTeX line. Exceeding this forces a break to prevent screen overflow.',
    defaultValue: 30,
  });

  await plugin.settings.registerBooleanSetting({
    id: 'merge compounds',
    title: 'Bracket Mode: Merge Compound Words',
    description: 'Combine adjacent furigana into a single bracket structure.',
    defaultValue: true,
  });

  await plugin.settings.registerDropdownSetting({
    id: 'full conversion style',
    title: 'Full Conversion Style',
    description: 'Style used when converting the entire Rem.',
    defaultValue: 'latex',
    options: [
      { key: 'latex', label: 'LaTeX (Floating)', value: 'latex' },
      { key: 'bracket', label: 'Bracket(Reading)', value: 'bracket' },
    ],
  });

  await plugin.settings.registerDropdownSetting({
    id: 'selection conversion style',
    title: 'Selection Conversion Style',
    description: 'Style used when converting highlighted text.',
    defaultValue: 'bracket',
    options: [
      { key: 'latex', label: 'LaTeX (Floating)', value: 'latex' },
      { key: 'bracket', label: 'Bracket (Reading)', value: 'bracket' },
    ],
  });

  await plugin.app.registerCommand({
    id: 'furigana',
    name: 'Add Furigana',
    action: async () => {
      const focusedRem = await plugin.focus.getFocusedRem();
      const selection = await plugin.editor.getSelection();
      const selectedRem = await plugin.editor.getSelectedRem();

      // mode3: bulks of rem
      if (selectedRem && selectedRem.remIds && selectedRem.remIds.length >= 1) {
        const style = (await plugin.settings.getSetting('full conversion style')) || 'latex';

        for (const remId of selectedRem.remIds) {
          const rem = await plugin.rem.findOne(remId);
          if (!rem) {
            await plugin.app.toast(`Furigana Helper: rem not found: ${remId}`);
            continue;
          }

          const text = await plugin.richText.toString(rem.text);
          await plugin.app.toast(`text: ${text}`);
          if (!/[一-龠ぁ-ゔァ-ヴー]/.test(text)) {
            await plugin.app.toast('Furigana Helper: no japanese, skip');
            continue;
          }

          if (style === 'bracket') {
            const resultText = await getFuriganaBrackets(plugin, text);
            await rem.setText([resultText]);
          } else {
            const richTextArray = await processLongTextToLatex(plugin, text);
            await rem.setText(richTextArray);
          }
        }
        await plugin.app.toast('Furigana Helper: All Rems converted! ✨');
      }

      // mode1, mode2 need focusedRem
      if (!focusedRem) return;
      // mode1 vs mode2
      const selectedText =
        selection && selection.type === 'Text' && selection.range
          ? (await plugin.richText.toString(selection.richText)).trim()
          : '';

      if (selectedText && /[一-龠ぁ-ゔァ-ヴー]/.test(selectedText)) {
        // mode1: selection
        const style = (await plugin.settings.getSetting('selection conversion style')) || 'bracket';

        const originalRichText = await focusedRem.text;
        if (selection?.type !== 'Text') return;
        const findRichText = selection.richText;
        let replaceRichText;

        if (style === 'bracket') {
          const resultText = await getFuriganaBrackets(plugin, selectedText);
          replaceRichText = await plugin.richText.parseFromMarkdown(resultText);
        } else {
          const latexText = await getFuriganaLatex(plugin, selectedText);
          replaceRichText = [{ i: 'x' as const, text: latexText, block: false }];
        }

        const newRichText = await plugin.richText.replaceAllRichText(
          originalRichText,
          findRichText,
          replaceRichText
        );

        await focusedRem.setText(newRichText);
        await plugin.app.toast('Furigana Helper: Selection Furigana added! ✨');
      } else {
        // mode2: full rem
        const rawText = await plugin.richText.toString(focusedRem.text);
        if (!/[一-龠ぁ-ゔァ-ヴー]/.test(rawText)) return;
        const conversionStyle =
          (await plugin.settings.getSetting('full conversion style')) || 'latex';

        if (conversionStyle === 'bracket') {
          const bracketedText = await getFuriganaBrackets(plugin, rawText);
          await focusedRem.setText([bracketedText]);
        } else {
          const richTextArray = await processLongTextToLatex(plugin, rawText);
          await focusedRem.setText(richTextArray);
        }
        await plugin.app.toast('Furigana Helper: Full Rem converted! ✨');
      }
    },
    keyboardShortcut: 'alt+shift+f',
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
