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
        this.intentos = 0;
        this.maxIntentos = 3; // Máximo número de intentos antes de volver al inicio
    }

    async connect() {
        // Si ya superamos los intentos, volvemos a empezar todo el proceso
        if (this.intentos >= this.maxIntentos) {
            this.intentos = 0;
            console.log(chalk.red.bold('❌ Se hicieron varios intentos sin éxito, volviendo al menú principal...\n'));
            setTimeout(() => this.connect(), 2000);
            return;
        }

        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // 📌 ELECCIÓN DE MÉTODO
        if (!this.tipoVinculacion) {
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
                            resolve(null);
                        }
                    }
                );
            });

            if (!this.tipoVinculacion) {
                rl.close();
                return this.connect();
            }

            console.log('');
        }

        // 📌 PETICIÓN DE NÚMERO
        if (!this.phoneNumber) {
            console.log(chalk.blue('📝 Ejemplo correcto: Si tu número es +52 33 1234 5678 → escribe: 523312345678'));
            console.log(chalk.blue('⚠️ Solo números, sin signos, espacios, guiones ni paréntesis\n'));

            this.phoneNumber = await new Promise(resolve => {
                rl.question(
                    chalk.blue('📱 Ingresa tu número con código de país: '),
                    num => {
                        const numeroLimpio = num.replace(/\D/g, '');
                        resolve(numeroLimpio);
                    }
                );
            });

            rl.close();

            // Validación correcta del número
            if (!this.phoneNumber || this.phoneNumber.length < 10 || this.phoneNumber.length > 15) {
                console.log(chalk.red.bold('❌ El número ingresado no es válido, verifica e inténtalo de nuevo\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return this.connect();
            }

            console.log(chalk.yellow.bold(`⏳ Preparando conexión para el número: ${this.phoneNumber}\n`));
        }

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' }, ),
            markAsOnline: true,
            connectTimeoutMs: 60000,
            retryDelayMs: 2000
        });

        // Guardar datos when update
        this.socket.ev.on('creds.update', saveCreds);

        // Manejo centralizado de todo el proceso
        this.socket.ev.on('connection.update', async (actualizacion) => {
            const { connection, qr, code } = actualizacion;

            // ✅ CONEXIÓN EXITOSA
            if (connection === 'open') {
                this.intentos = 0;
                console.log(chalk.green.bold('✅ CONEXIÓN ESTABLECIDA CORRECTAMENTE'));
                console.log(chalk.blue(`🤖 Bot activo y funcionando con el número: ${this.phoneNumber}\n`));
                // Reiniciamos valores por si se vuelve a conectar más adelante
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return;
            }

            // ❌ CONEXIÓN CERRADA O FALLIDA
            if (connection === 'close') {
                const razon = actualizacion?.reason;
                const mensajeError = actualizacion?.payload?.error?.message || 'Motivo desconocido';

                // Si fue por cierre de sesión definitivo
                if (razon === DisconnectReason.loggedOut) {
                    console.log(chalk.red.bold('❌ La sesión se cerró por completo, debes volver a realizar todo el proceso\n'));
                    this.phoneNumber = null;
                    this.tipoVinculacion = null;
                    this.intentos = 0;
                    setTimeout(() => this.connect(), 2500);
                    return;
                }

                // Si es un error temporal, intentamos de nuevo
                this.intentos++;
                console.log(chalk.red.bold(`📴 Conexión cerrada: ${mensajeError}`));
                console.log(chalk.yellow.bold(`🔁 Intento ${this.intentos} de ${this.maxIntentos} - Volviendo a intentar...\n`));

                setTimeout(() => {
                    this.connect();
                }, 3500);
                return;
            }

            // 🔢 OPCIÓN 1: CÓDIGO NUMÉRICO
            if (this.tipoVinculacion === '1') {
                // Esperamos a que el código esté disponible, no lo pedimos antes de tiempo
                if (code) {
                    this.intentos = 0;
                    console.log(chalk.magenta.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${chalk.white.bgBlack.bold(` ${code} `)}`));
                    console.log(chalk.magenta('📋 PASOS PARA VINCULAR:'));
                    console.log(chalk.magenta('1. Abre WhatsApp en tu teléfono'));
                    console.log(chalk.magenta('2. Ve a Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
                    console.log(chalk.magenta('3. Selecciona la opción: "Vincular con número de teléfono"'));
                    console.log(chalk.magenta('4. Ingresa el código que aparece arriba'));
                    console.log(chalk.magenta('⚠️ El código caduca en pocos minutos, úsalo rápido\n'));
                    return;
                }

                // Solo si aún no hay código, lo solicitamos y con control de errores
                try {
                    // Agregamos tiempo de espera para asegurar que ya hay conexión
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    const codigoGenerado = await this.socket.requestPairingCode(this.phoneNumber);
                    
                    if (codigoGenerado) {
                        this.intentos = 0;
                        console.log(chalk.magenta.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${chalk.white.bgBlack.bold(` ${codigoGenerado} `)}`));
                        console.log(chalk.magenta('📋 PASOS PARA VINCULAR:'));
                        console.log(chalk.magenta('1. Abre WhatsApp en tu teléfono'));
                        console.log(chalk.magenta('2. Ve a Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
                        console.log(chalk.magenta('3. Selecciona la opción: "Vincular con número de teléfono"'));
                        console.log(chalk.magenta('4. Ingresa el código que aparece arriba'));
                        console.log(chalk.magenta('⚠️ El código caduca en pocos minutos, úsalo rápido\n'));
                    }
                } catch (error) {
                    console.log(chalk.red.bold(`❌ Error al generar código: ${error.message}`));
                }
            }

            // 📱 OPCIÓN 2: CÓDIGO QR
            if (this.tipoVinculacion === '2' && qr) {
                this.intentos = 0;
                console.log(chalk.yellow.bold('\n📲 CÓDIGO QR - ESCÁNEALO CON TU WHATSAPP:'));
                qrcodeTerminal.generate(qr, { small: true });
                console.log(chalk.yellow('\n📋 PASOS PARA VINCULAR:'));
                console.log(chalk.yellow('1. Abre WhatsApp en tu teléfono'));
                console.log(chalk.yellow('2. Ve a Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
                console.log(chalk.yellow('3. Escanea este código con tu cámara'));
                console.log(chalk.yellow('⌛ Esperando confirmación...\n'));
            }
        });

        return this.socket;
    }
}
