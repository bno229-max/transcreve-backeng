require('dotenv').config(); // Carrega as variáveis do arquivo .env ou do servidor
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
const speech = require('@google-cloud/speech');

const app = express();

// Configura CORS para permitir acesso vindo do seu domínio da Vercel
app.use(cors());

// Usa a pasta /tmp para compatibilidade com servidores na nuvem
const upload = multer({ dest: '/tmp/' });

// Configuração das credenciais do Google via Variável de Ambiente
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const projectId = credentials.project_id;
const bucketName = process.env.GOOGLE_BUCKET_NAME || 'transcreve-ai-audios';

const storage = new Storage({ projectId, credentials });
const speechClient = new speech.SpeechClient({ projectId, credentials });

app.post('/api/transcrever', upload.single('audio_file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
        }

        const filePath = req.file.path;
        const destination = `${Date.now()}_${req.file.originalname || 'audio.webm'}`;

        // 1. Upload para o Google Storage
        await storage.bucket(bucketName).upload(filePath, { destination });
        const gcsUri = `gs://${bucketName}/${destination}`;

        // 2. Transcrição via Speech-to-Text
        const request = {
            audio: { uri: gcsUri },
            config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: 'pt-BR',
                enableAutomaticPunctuation: true
            }
        };

        const [operation] = await speechClient.longRunningRecognize(request);
        const [response] = await operation.promise();

        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');

        // Limpa o arquivo temporário do servidor
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ success: true, text: transcription });

    } catch (error) {
        console.error("Erro no processamento:", error);
        res.status(500).json({ success: false, error: 'Erro ao transcrever áudio: ' + error.message });
    }
});

// Porta dinâmica para a nuvem
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));