const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const speech = require('@google-cloud/speech');

// Configura o caminho do FFmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const upload = multer({ dest: 'uploads/' });

// Instancia o cliente do Google Cloud (Certifique-se de que a GOOGLE_CREDENTIALS está certa no Render)
const client = new speech.SpeechClient();

app.post('/upload', upload.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum áudio enviado.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(__dirname, 'uploads', `${req.file.filename}.wav`);

    // Converte QUALQUER formato (Opus do WhatsApp, WebM, M4A) para WAV (LINEAR16) 16000Hz
    ffmpeg(inputPath)
        .toFormat('wav')
        .audioChannels(1) // Google prefere áudio mono
        .audioFrequency(16000) // Taxa de amostragem ideal para reconhecimento de voz
        .on('error', (err) => {
            console.error('Erro na conversão:', err);
            fs.unlinkSync(inputPath); // Limpa o arquivo original
            res.status(500).json({ error: 'Erro ao processar o áudio.' });
        })
        .on('end', async () => {
            try {
                // Lê o arquivo convertido
                const audioBytes = fs.readFileSync(outputPath).toString('base64');

                const request = {
                    audio: {
                        content: audioBytes,
                    },
                    config: {
                        encoding: 'LINEAR16', // Agora sempre será LINEAR16, não importa a origem
                        sampleRateHertz: 16000,
                        languageCode: 'pt-BR',
                    },
                };

                // Envia para o Google Cloud
                const [response] = await client.recognize(request);
                const transcription = response.results
                    .map(result => result.alternatives[0].transcript)
                    .join('\n');

                // Retorna a transcrição
                res.json({ transcription: transcription });

            } catch (error) {
                console.error('Erro no Google Speech:', error);
                res.status(500).json({ error: 'Erro ao transcrever.' });
            } finally {
                // Limpeza dos arquivos temporários no servidor do Render
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            }
        })
        .save(outputPath);
});

// Seu app.listen em 0.0.0.0 e na porta do Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});