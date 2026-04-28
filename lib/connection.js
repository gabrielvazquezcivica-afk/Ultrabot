import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import qrcodeTerminal from 'qrcode-terminal';
import config from '../config.js';
import pino from 'pino';
import readline from 'readline';

export default class LibConnection {
    constructor() {
        this.phoneNumber = null;
        this.tipoVinculacion = null;
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

        // 📌 PRIMERO: MOSTRAMOS LAS OPCIONES PARA ELEGIR
        console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'));
        console.log(chalk.green('🔢 Opción 1: Usar código numérico'));
        console.log(chalk.green('📱 Opción 2: Usar código QR'));
        console.log('');

        this.tipoVinculacion = await new Promise(resolve => {
            rl.question(
                chalk.blue('👉 Escribe el número de la opción que prefieras (1 o 2): '),
                opcion => {
                    opcion = opcion.trim();
                    if (opcion === '1' || opcion === '2') {
                        resolve(opcion);
                    } else {
                        console.log(chalk.red.bold('❌ Opción inválida, solo puedes escribir 1 o 2\n'));
                        resolve(this.connect());
                    }
                }
            );
        });

        console.log('');

        // 📌 DESPUÉS: PEDIMOS EL NÚMERO
        console.log(chalk.blue('📝 Ejemplo correcto: Si tu número es +52 33 1234 5678 → escribe: 523312345678'));
        console.log(chalk.blue('⚠️ Solo números, sin signos, espacios, guiones ni paréntesis\n'));

        this.phoneNumber = await new Promise(resolve => {
            rl.question(
                chalk.blue('📱 Ingresa tu número con código de país: '),
                num => {
                    rl.close();
                    // Dejamos solo números
                    const numeroLimpio = num.replace(/\D/g, '');
                    resolve(numeroLimpio);
                }
            );
        });

        // Validación del número
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

        // Guardar datos de sesión
        this.socket.ev.on('creds.update', saveCreds);

        // Manejo de la conexión
        this.socket.ev.on('connection.update', async (actualizacion) => {
            const { connection, qr, code } = actualizacion;

            // Conexión exitosa
            if (connection === 'open') {
                console.log(chalk.green.bold('✅ Conexión establecida correctamente'));
                console.log(chalk.blue(`🤖 Bot funcionando con el número: ${this.phoneNumber}\n`));
                return;
            }

            // Manejo de desconexiones
            if (connection === 'close') {
                const razon = actualizacion?.reason;
                if (razon !== DisconnectReason.loggedOut) {
                    console.log(chalk.red.bold('📴 Se perdió la conexión, intentando reconectar...'));
                    console.log(chalk.yellow.bold('♻️ Reinicio automático inmediato...\n'));
                    setTimeout(() => this.connect(), 3000);
                } else {
                    console.log(chalk.red.bold('❌ Sesión finalizada, debes volver a vincular\n'));
                    setTimeout(() => this.connect(), 2000);
                }
                return;
            }

            // 📌 MOSTRAMOS LO QUE CORRESPONDA SEGÚN LO ELEGIDO
            // Si eligió opción 1: CÓDIGO NUMÉRICO
            if (this.tipoVinculacion === '1') {
                if (code) {
                    console.log(chalk.magenta.bold(`\n🔑 Tu código de vinculación es: ${chalk.white.bgBlack.bold(` ${code} `)}`));
                    console.log(chalk.magenta('📋 Pasos para vincular:'));
                    console.log(chalk.magenta('1. Abre WhatsApp en tu teléfono'));
                    console.log(chalk.magenta('2. Ve a Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
                    console.log(chalk.magenta('3. Selecciona la opción: "Vincular con número de teléfono"'));
                    console.log(chalk.magenta('4. Ingresa el código que aparece arriba\n'));
                } else {
                    try {
                        const codigoGenerado = await this.socket.requestPairingCode(this.phoneNumber);
                        console.log(chalk.magenta.bold(`\n🔑 Tu código de vinculación es: ${chalk.white.bgBlack.bold(` ${codigoGenerado} `)}`));
                        console.log(chalk.magenta('📋 Pasos para vincular:'));
                        console.log(chalk.magenta('1. Abre WhatsApp en tu teléfono'));
                        console.log(chalk.magenta('2. Ve a Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
                        console.log(chalk.magenta('3. Selecciona la opción: "Vincular con número de teléfono"'));
                        console.log(chalk.magenta('4. Ingresa el código que aparece arriba\n'));
                    } catch (error) {
                        console.log(chalk.red.bold(`❌ No se pudo generar el código: ${error.message}`));
                        console.log(chalk.yellow.bold('🔁 Intentando nuevamente...\n'));
                    }
                }
            }

            // Si eligió opción 2: CÓDIGO QR
            if (this.tipoVinculacion === '2' && qr) {
                console.log(chalk.yellow.bold('\n📲 CÓDIGO QR - ESCÁNEALO CON TU WHATSAPP:'));
                qrcodeTerminal.generate(qr, { small: true });
                console.log(chalk.yellow('\n📋 Pasos para vincular:'));
                console.log(chalk.yellow('1. Abre WhatsApp en tu teléfono'));
                console.log(chalk.yellow('2. Ve a Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
                console.log(chalk.yellow('3. Escanea este código con tu cámara\n'));
                console.log(chalk.yellow('⌛ Esperando que se complete la vinculación...\n'));
            }
        });

        return this.socket;
    }
}
