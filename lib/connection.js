import * as Baileys from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';
import Pino from 'pino';

class LibConnection {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.sock = null;
    }

    async connect() {
        // Encabezado principal
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        // Instrucciones
        console.log(chalk.cyan('📌 Formato: código de país + número, sin signos ni ceros al inicio'));
        console.log(chalk.gray('Ejemplo: 5213331234567\n'));

        return new Promise((resolver, rechazar) => {
            this.rl.question(chalk.white('Ingresa tu número: '), async (numero) => {
                let numeroLimpio = numero.trim();

                // Eliminamos cualquier signo o espacio por si acaso
                numeroLimpio = numeroLimpio.replace(/[^0-9]/g, '');

                if (numeroLimpio.length < 8) {
                    console.log(chalk.red('⚠️ El número ingresado no es válido'));
                    this.rl.close();
                    return rechazar(new Error('Número incorrecto'));
                }

                try {
                    const resultado = await this.iniciar(numeroLimpio);
                    resolver(resultado);
                } catch (err) {
                    rechazar(err);
                }
            });
        });
    }

    async iniciar(numeroUsuario) {
        const { useMultiFileAuthState } = Baileys;
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        // ✅ FUNCIÓN OBTENIDA DE FORMA SEGURA Y SIN ERRORES
        const makeWASocket = Baileys.default || Baileys.makeWASocket;
        if (!makeWASocket || typeof makeWASocket !== 'function') {
            throw new Error('No se pudo cargar la función de conexión, intenta reinstalar los paquetes');
        }

        // ✅ CONFIGURACIÓN ESPECIAL PARA TERMUX
        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 300000,
            keepAliveIntervalMs: 25000,
            defaultQueryTimeoutMs: 200000,
            retryRequestDelayMs: 4000,
            fireInitQueries: false,
            shouldSyncHistoryMessage: false,
            browser: ['Termux', 'Chrome', '118.0.0'],
            version: [2, 2323, 4],
            logger: Pino({ level: 'silent' }),
            generateHighQualityLinkPreview: false,
            patchMessageBeforeSending: msg => msg
        });

        this.sock.ev.on('creds.update', saveCreds);

        return new Promise((resolver, rechazar) => {
            let codigoMostrado = false;

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, code, error } = update;
                const { DisconnectReason } = Baileys;

                // Conexión exitosa
                if (connection === 'open') {
                    console.log(chalk.green.bold('\n✅ ¡CONECTADO CORRECTAMENTE A WHATSAPP!'));
                    console.log(chalk.gray('→ El bot está listo para funcionar\n'));
                    this.rl.close();
                    return resolver(this.sock);
                }

                // Si se cierra
                if (connection === 'close') {
                    const motivo = error?.output?.statusCode ? DisconnectReason[error.output.statusCode] : 'Desconocido';
                    console.log(chalk.yellow(`⚠️ Conexión cerrada: ${motivo}`));

                    // Solo detenemos si es error definitivo
                    if (motivo === DisconnectReason.loggedOut || motivo === DisconnectReason.badSession) {
                        console.log(chalk.red('❌ Sesión dañada, elimina la carpeta sesion y vuelve a intentar\n'));
                        this.rl.close();
                        return rechazar(new Error('Sesión inválida'));
                    }
                }

                // Mostrar código
                if (code && !codigoMostrado) {
                    codigoMostrado = true;
                    console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}`));
                    console.log(chalk.gray(`→ Número: ${numeroUsuario}`));
                    console.log(chalk.gray('📋 Pasos:'));
                    console.log(chalk.gray('   1. Abre WhatsApp'));
                    console.log(chalk.gray('   2. Ve a Ajustes > Dispositivos vinculados'));
                    console.log(chalk.gray('   3. Elige: Vincular con número de teléfono'));
                    console.log(chalk.gray('   4. Escribe el código mostrado\n'));
                }
            });

            // ✅ SOLICITUD DE CÓDIGO EN EL MOMENTO EXACTO
            const generarCodigo = async () => {
                try {
                    // Esperamos el tiempo necesario para evitar errores
                    await new Promise(espera => setTimeout(espera, 8000));

                    if (!this.sock.authState.creds.registered) {
                        await this.sock.requestPairingCode(numeroUsuario);
                    }
                } catch (err) {
                    console.log(chalk.red(`⚠️ Error al generar: ${err.message}`));
                    setTimeout(() => generarCodigo(), 4000);
                }
            };

            generarCodigo();
        });
    }
}

export default LibConnection;
                        
