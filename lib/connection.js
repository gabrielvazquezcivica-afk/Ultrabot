import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import qrcodeTerminal from 'qrcode-terminal';
import config from '../config.js';
import pino from 'pino';
import readline from 'readline';

export default class LibConnection {
    constructor() {
        this.phoneNumber = null;
        this.socket = null;
    }

    async connect() {
        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // 📌 AGREGADO: Ejemplo claro de cómo poner el número
        console.log(chalk.blue('📝 Ejemplo correcto: Si tu número es +52 33 1234 5678 → escribe: 523312345678'));
        console.log(chalk.blue('⚠️ Solo números, sin signos, espacios, guiones ni paréntesis\n'));

        this.phoneNumber = await new Promise(resolve => {
            rl.question(
                chalk.blue('📱 Ingresa tu número con código de país: '),
                num => {
                    rl.close();
                    // Nos aseguramos que solo queden números
                    const numeroLimpio = num.replace(/\D/g, '');
                    resolve(numeroLimpio);
                }
            );
        });

        // Si por alguna razón no puso número, no continuamos
        if (!this.phoneNumber || this.phoneNumber.length < 8) {
            console.log(chalk.red.bold('❌ El número ingresado no es válido, inténtalo de nuevo\n'));
            return this.connect();
        }

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' })
        });

        // Guardamos los datos de sesión cuando cambien
        this.socket.ev.on('creds.update', saveCreds);

        // Manejo completo de la conexión
        this.socket.ev.on('connection.update', async (actualizacion) => {
            const { connection, qr, code, isNewLogin } = actualizacion;

            // Si la conexión fue exitosa
            if (connection === 'open') {
                console.log(chalk.green.bold('✅ Conexión establecida correctamente'));
                console.log(chalk.blue(`🤖 Bot funcionando con el número: ${this.phoneNumber}\n`));
                return;
            }

            // Si hay desconexión
            if (connection === 'close') {
                const motivo = actualizacion?.payload?.error?.message || 'Desconocido';
                const razon = actualizacion?.reason;

                // Si la desconexión es por motivo que podemos solucionar, volvemos a intentar
                if (razon !== DisconnectReason.loggedOut) {
                    console.log(chalk.red.bold(`📴 Se perdió la conexión: ${motivo}`));
                    console.log(chalk.yellow.bold('♻️ Intentando conectar nuevamente...\n'));
                    
                    // Esperamos un poco antes de volver a intentar
                    setTimeout(() => this.connect(), 3000);
                } else {
                    console.log(chalk.red.bold('❌ Se cerró la sesión por completo, debes volver a vincular\n'));
                    setTimeout(() => this.connect(), 2000);
                }
                return;
            }

            // 🟡 SI USAS CÓDIGO DE VINCULACIÓN
            if (config.login.pairing) {
                // Verificamos si ya tenemos el código generado
                if (code) {
                    console.log(chalk.magenta.bold(`\n🔑 Tu código de vinculación es: ${chalk.white.bgBlack.bold(` ${code} `)}`));
                    console.log(chalk.magenta('Pasos para vincular:'));
                    console.log(chalk.magenta('1. Abre WhatsApp en tu teléfono'));
                    console.log(chalk.magenta('2. Ve a Ajustes > Dispositivos vinculados > Vincular dispositivo'));
                    console.log(chalk.magenta('3. Selecciona "Vincular con número de teléfono"'));
                    console.log(chalk.magenta('4. Ingresa el código que te aparece arriba\n'));
                } else {
                    // Si aún no se ha generado, lo solicitamos
                    try {
                        const codigoGenerado = await this.socket.requestPairingCode(this.phoneNumber);
                        console.log(chalk.magenta.bold(`\n🔑 Tu código de vinculación es: ${chalk.white.bgBlack.bold(` ${codigoGenerado} `)}`));
                        console.log(chalk.magenta('Pasos para vincular:'));
                        console.log(chalk.magenta('1. Abre WhatsApp en tu teléfono'));
                        console.log(chalk.magenta('2. Ve a Ajustes > Dispositivos vinculados > Vincular dispositivo'));
                        console.log(chalk.magenta('3. Selecciona "Vincular con número de teléfono"'));
                        console.log(chalk.magenta('4. Ingresa el código que te aparece arriba\n'));
                    } catch (error) {
                        console.log(chalk.red.bold(`❌ No se pudo generar el código: ${error.message}`));
                        console.log(chalk.yellow.bold('🔁 Intentando nuevamente...\n'));
                    }
                }
            }

            // 🟡 SI USAS CÓDIGO QR
            if (!config.login.pairing && qr) {
                console.log(chalk.yellow.bold('\n📲 Escanea este código QR con tu WhatsApp:'));
                qrcodeTerminal.generate(qr, { small: true });
                console.log(chalk.yellow('\n⌛ Esperando que se escanee el código...\n'));
            }
        });

        return this.socket;
    }
}
