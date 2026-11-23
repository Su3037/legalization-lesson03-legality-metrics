"""TTS engines (sherpa-onnx) and ASR models used in the audition. Model directory: $MODELS
(default /opt/models). Patched lexicons come from patch_lexicon.py."""
import os
from pathlib import Path

import numpy as np
import sherpa_onnx as so
import soundfile as sf

M = Path(os.environ.get("MODELS", "/opt/models"))
P = M / "patched"
THREADS = int(os.environ.get("THREADS", "4"))


def tts(name, patched=True):
    if name.startswith("kokoro"):
        d = M / "kokoro-multi-lang-v1_1"
        lex = (P / "kokoro-lexicon.txt") if patched else d / "lexicon-zh.txt"
        cfg = so.OfflineTtsModelConfig(kokoro=so.OfflineTtsKokoroModelConfig(
            model=str(d / "model.onnx"), voices=str(d / "voices.bin"), tokens=str(d / "tokens.txt"),
            data_dir=str(d / "espeak-ng-data"), dict_dir=str(d / "dict"),
            lexicon=f"{d/'lexicon-us-en.txt'},{lex}"), num_threads=THREADS)
        fsts = f"{d/'date-zh.fst'},{d/'phone-zh.fst'},{d/'number-zh.fst'}"
    elif name == "melo":
        d = M / "vits-melo-tts-zh_en"
        lex = (P / "melo-lexicon.txt") if patched else d / "lexicon.txt"
        cfg = so.OfflineTtsModelConfig(vits=so.OfflineTtsVitsModelConfig(
            model=str(d / "model.onnx"), lexicon=str(lex), tokens=str(d / "tokens.txt"), dict_dir=str(d / "dict")),
            num_threads=THREADS)
        fsts = f"{d/'date.fst'},{d/'phone.fst'},{d/'number.fst'},{d/'new_heteronym.fst'}"
    elif name == "matcha":
        d = M / "matcha-icefall-zh-baker"
        lex = (P / "matcha-lexicon.txt") if patched else d / "lexicon.txt"
        cfg = so.OfflineTtsModelConfig(matcha=so.OfflineTtsMatchaModelConfig(
            acoustic_model=str(d / "model-steps-3.onnx"), vocoder=str(M / "vocos-22khz-univ.onnx"),
            lexicon=str(lex), tokens=str(d / "tokens.txt"), dict_dir=str(d / "dict")), num_threads=THREADS)
        fsts = f"{d/'date.fst'},{d/'phone.fst'},{d/'number.fst'}"
    elif name == "zipvoice":
        d = (M / "zipvoice-patched") if patched else M / "sherpa-onnx-zipvoice-distill-zh-en-emilia"
        cfg = so.OfflineTtsModelConfig(zipvoice=so.OfflineTtsZipvoiceModelConfig(
            tokens=str(d / "tokens.txt"), encoder=str(d / "text_encoder.onnx"), decoder=str(d / "fm_decoder.onnx"),
            vocoder=str(d / "vocos_24khz.onnx"), data_dir=str(d / "espeak-ng-data"), lexicon=str(d / "pinyin.raw")),
            num_threads=THREADS)
        fsts = ""
    else:
        raise KeyError(name)
    return so.OfflineTts(so.OfflineTtsConfig(model=cfg, rule_fsts=fsts, max_num_sentences=1))


def asr(name):
    if name == "paraformer":
        d = M / "sherpa-onnx-paraformer-zh-2024-03-09"
        return so.OfflineRecognizer.from_paraformer(paraformer=str(d / "model.int8.onnx"), tokens=str(d / "tokens.txt"),
                                                    num_threads=THREADS)
    if name == "sensevoice":
        d = M / "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
        return so.OfflineRecognizer.from_sense_voice(model=str(d / "model.int8.onnx"), tokens=str(d / "tokens.txt"),
                                                     language="zh", use_itn=False, num_threads=THREADS)
    if name == "whisper":
        d = M / "sherpa-onnx-whisper-turbo"
        return so.OfflineRecognizer.from_whisper(encoder=str(d / "turbo-encoder.int8.onnx"),
                                                 decoder=str(d / "turbo-decoder.int8.onnx"),
                                                 tokens=str(d / "turbo-tokens.txt"), language="zh", num_threads=THREADS)
    raise KeyError(name)


def transcribe(rec, samples, sr):
    s = rec.create_stream()
    if sr != 16000:
        import scipy.signal as ss
        samples = ss.resample_poly(samples, 16000, sr).astype(np.float32)
        sr = 16000
    s.accept_waveform(sr, samples)
    rec.decode_stream(s)
    return s.result.text


def read(path):
    x, sr = sf.read(path, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    return x, sr
