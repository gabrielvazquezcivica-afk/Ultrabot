import { Client, LocalAuth } from 'whatsapp-web.js';
import chalk from 'chalk';
import readline from 'readline';
import qrcodeTerminal from 'qrcode-terminal';
import config from './config.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

export default class LibConnection {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-gpu', 
                    '--disable-dev-shm-usage', 
                    '--disable-extensions'
                ]
            }
        });

        this.phoneNumber = null;
        this.authMethod = config.login.pairing ? 'code' : 'qr';

        this._setupEvents();
    }

    _setupEvents() {
        this.client.on('ready', () => {
            console.log(chalk.green.bold('✅ Conexión establecida exitosamente'));
            console.log(chalk.blue(`🤖 Bot activo y funcionando con el número: ${this.phoneNumber}`));
        });

        this.client.on('qr', (qr) => {
            if (this.authMethod === 'qr') {
                console.log(chalk.yellow.bold('\n📲 Escanea este código QR para iniciar sesión:'));
                qrcodeTerminal.generate(qr, { small: true });
            }
        });

        this.client.on('code', (code) => {
            if (this.authMethod === 'code') {
                console.log(chalk.magenta.bold(`\n🔑 Tu código de 8 dígitos es: ${chalk.white.bgBlack.bold(` ${code} `)}`));
                console.log(chalk.magenta('Ingrésalo en tu aplicación de WhatsApp para vincular el dispositivo'));
            }
        });

        this.client.on('authenticated', () => {
            console.log(chalk.green('🔐 Autenticación completada correctamente'));
        });

        this.client.on('auth_failure', (err) => {
            console.log(chalk.red.bold(`❌ Error de autenticación: ${err.message}`));
            process.exit(1);
        });

        this.client.on('disconnected', () => {
            console.log(chalk.red.bold('📴 Se ha perdido la conexión con WhatsApp'));
            process.exit(0);
        });
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log(chalk.cyan.bold('====================================='));
            console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - LIB BOT   '));
            console.log(chalk.cyan.bold('=====================================\n'));

            rl.question(
                chalk.blue('📱 Ingresa el número donde funcionará el bot (incluye código de país, ej: 5213312345678): '),
                (number) => {
                    if (!number || isNaN(number)) {
                        console.log(chalk.red('❌ El número ingresado no es válido'));
                        rl.close();
                        return reject(new Error('Número inválido'));
                    }

                    this.phoneNumber = number;

                    console.log(chalk.cyan.bold('\n🔽 MÉTODO DE CONEXIÓN DEFINIDO EN CONFIGURACIÓN:'));
                    console.log(
                        config.login.pairing 
                            ? chalk.yellow('🔑 Se usará: Código de 8 dígitos') 
                            : chalk.yellow('📲 Se usará: Código QR')
                    );
                    console.log('');

                    rl.close();

                    try {
                        await this.client.initialize();
                        resolve(this.client);
                    } catch (err) {
                        reject(err);
                    }
                }
            );
        });
    }
}
