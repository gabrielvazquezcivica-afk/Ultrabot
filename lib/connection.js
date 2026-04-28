import { default as makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import qrcodeTerminal from 'qrcode-terminal';
import config from '../config.js';
import pino from 'pino';
import readline from 'readline'; // ✅ Agregamos esta línea para importarlo correctamente

export default class LibConnection {
    constructor() {
        this.phoneNumber = null;
        this.socket = null;
    }

    async connect() {
        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        // ✅ Cambiamos la línea que usaba require por la forma correcta
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.phoneNumber = await new Promise(resolve => {
            // ✅ Usamos el nuevo nombre que le pusimos
            rl.question(
                chalk.blue('📱 Ingresa tu número con código de país: '),
                num => {
                    rl.close(); // ✅ También cambiamos aquí
                    resolve(num.replace(/\D/g, ''));
                }
            );
        });

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            printQRInTerminal: !config.login.pairing,
            syncFullHistory: false,
            logger: pino({ level: 'silent' })
        });

        if (config.login.pairing) {
            let codigo = await this.socket.requestPairingCode(this.phoneNumber);
            console.log(chalk.magenta.bold(`\n🔑 Tu código de vinculación es: ${chalk.white.bgBlack.bold(` ${codigo} `)}`));
            console.log(chalk.magenta('Ingrésalo en WhatsApp > Dispositivos vinculados\n'));
        }

        this.socket.ev.on('creds.update', saveCreds);

        this.socket.ev.on('connection.update', actualizacion => {
            const { connection, qr } = actualizacion;

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ Conexión establecida correctamente'));
                console.log(chalk.blue(`🤖 Bot funcionando con el número: ${this.phoneNumber}\n`));
            }

            if (connection === 'close') {
                console.log(chalk.red.bold('📴 Se perdió la conexión, intentando reconectar...'));
                setTimeout(() => this.connect(), 5000);
            }

            if (qr && !config.login.pairing) {
                console.log(chalk.yellow.bold('\n📲 Escanea este código QR:'));
                qrcodeTerminal.generate(qr, { small: true });
            }
        });

        return this.socket;
    }
}
