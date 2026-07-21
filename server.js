const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { SpeechClient } = require('@google-cloud/speech');
const { Storage } = require('@google-cloud/storage');

const app = express();

// A MÁGICA AQUI: Isso libera o navegador para enviar o áudio sem dar erro de CORS
app.use(cors()); 
app.use(express.json());

// Configurando o Multer para receber o arquivo de áudio na memória
const upload = multer({ storage: multer.memoryStorage() });

// Configuração do Google Cloud usando as variáveis de ambiente que você colocou no Render
let credentialsObj = {};
if (process.env.GOOGLE_CREDENTIALS) {
    try {
        credentialsObj = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } catch (e) {
        console.error("Erro ao ler as credenciais do Google. Verifique a variável no Render.");
    }
}

const speechClient = new SpeechClient({ credentials: credentialsObj });
const storage = new Storage({ credentials: credentialsObj });
const bucketName = process.env.GOOGLE_BUCKET_NAME || 'seu-bucket-padrao';

// Rota principal de upload e transcrição
app.post('/upload', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo de áudio foi enviado.' });
        }

        console.log("Áudio recebido, iniciando processamento...");

        const audioBytes = req.file.buffer.toString('base64');

        const audio = {
            content: audioBytes,
        };

        const config = {
            encoding: 'WEBM_OPUS', // Ajuste conforme o formato de gravação do navegador
            sampleRateHertz: 48000,
            languageCode: 'pt-BR',
        };

        const request = {
            audio: audio,
            config: config,
        };

        // Chama a API do Google Speech-to-Text
        const [response] = await speechClient.recognize(request);
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');

        console.log("Transcrição concluída com sucesso!");
        
        // Retorna o texto para o frontend
        res.json({ transcription: transcription });

    } catch (error) {
        console.error("Erro durante a transcrição:", error);
        res.status(500).json({ error: 'Falha interna no processamento do áudio.', detalhes: error.message });
    }
});

// Rota de teste para ver se o servidor acordou no Render
app.get('/', (req, res) => {
    res.send("Servidor Transcreve.AI está online e rodando!");
});

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});