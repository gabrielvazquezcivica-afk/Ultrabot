import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
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
        this.intento = 0;
    }

    async connect() {
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        console.log(chalk.cyan('📌 Formato: código de país + número, sin signos ni ceros al inicio'));
        console.log(chalk.gray('Ejemplo: 5213331234567\n'));

        return new Promise((resolver, rechazar) => {
            this.rl.question(chalk.white('Ingresa tu número: '), async (numero) => {
                const numeroLimpio = numero.trim();

                if (!/^\d+$/.test(numeroLimpio)) {
                    console.log(chalk.red('⚠️ Solo ingresa números válidos'));
                    this.rl.close();
                    return rechazar(new Error('Número en formato incorrecto'));
                }

                const numeroFinal = numeroLimpio.startsWith('+') ? numeroLimpio.slice(1) : numeroLimpio;

                try {
                    const resultado = await this.iniciarProceso(numeroFinal);
                    resolver(resultado);
                } catch (err) {
                    rechazar(err);
                }
            });
        });
    }

    async iniciarProceso(numeroUsuario) {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 240000,
            keepAliveIntervalMs: 20000,
            defaultQueryTimeoutMs: 180000,
            retryRequestDelayMs: 3000,
            fireInitQueries: true,
            shouldSyncHistoryMessage: false,
            downloadHistory: false,
            syncCatalogs: false,
            browser: ['Ubuntu', 'Firefox', '120.0.0'],
            version: [2, 3000, 1015910914],
            logger: Pino({ level: 'silent' }),
            generateHighQualityLinkPreview: false,
            options: {
                timeout: 240000
            }
        });

        this.sock.ev.on('creds.update', saveCreds);

        return new Promise((resolver, rechazar) => {
            let codigoMostrado = false;
            let conexionLista = false;

            this.sock.ev.on('connection.update', async (actualizacion) => {
                const { connection, code, error } = actualizacion;

                if (connection === 'open') {
                    console.log(chalk.green.bold('\n✅ ¡CONECTADO CORRECTAMENTE A WHATSAPP!'));
                    console.log(chalk.gray('→ El bot está listo para funcionar\n'));
                    this.intento = 0;
                    this.rl.close();
                    conexionLista = true;
                    return resolver(this.sock);
                }

                if (connection === 'close') {
                    const codigoError = error?.output?.statusCode;
                    const razon = codigoError ? DisconnectReason[codigoError] : 'Motivo desconocido';

                    console.log(chalk.yellow(`⚠️ Estado de conexión: ${razon}`));

                    if (razon === DisconnectReason.loggedOut || razon === DisconnectReason.badSession) {
                        console.log(chalk.red('❌ Sesión inválida, elimina la carpeta "sesion" y vuelve a intentar\n'));
                        this.rl.close();
                        return rechazar(new Error('Sesión inválida'));
                    }

                    if (!conexionLista) {
                        this.intento++;
                        if (this.intento <= 10) {
                            console.log(chalk.yellow(`🔄 Reintentando conexión... (Intento ${this.intento}/10)\n`));
                            setTimeout(() => this.pedirCodigo(numeroUsuario), 4000);
                        } else {
                            console.log(chalk.red('❌ Se agotaron los intentos, intenta más tarde\n'));
                            this.rl.close();
                            return rechazar(new Error('No se pudo establecer conexión'));
                        }
                    }
                }

                if (code && !codigoMostrado) {
                    codigoMostrado = true;
                    this.intento = 0;
                    console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}`));
                    console.log(chalk.gray(`→ Número registrado: ${numeroUsuario}`));
                    console.log(chalk.gray('📋 Pasos para vincular:'));
                    console.log(chalk.gray('   1. Abre WhatsApp en tu teléfono'));
                    console.log(chalk.gray('   2. Ve a Ajustes ➜ Dispositivos vinculados'));
                    console.log(chalk.gray('   3. Toca: "Vincular con número de teléfono"'));
                    console.log(chalk.gray('   4. Escribe el código que ves arriba\n'));
                }
            });

            this.pedirCodigo = async (numero) => {
                try {
                    await new Promise(res => setTimeout(res, 7000));

                    if (!this.sock.authState.creds.registered) {
                        await this.sock.requestPairingCode(numero);
                    }
                } catch (err) {
                    console.log(chalk.red(`⚠️ Al generar código: ${err.message}`));
                    setTimeout(() => this.pedirCodigo(numero), 3500);
                }
            };

            this.pedirCodigo(numeroUsuario);
        });
    }
}

export default LibConnection;
                        
