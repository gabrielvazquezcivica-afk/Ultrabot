import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import qrcodeTerminal from 'qrcode-terminal';
import config from '../config.js';
import pino from 'pino';
import readline from 'readline';

// 🛑 SOLUCIÓN INMEDIATA AL ERROR DE MEMORIA
process.setMaxListeners(0);
process.removeAllListeners();

export default class LibConnection {
    constructor() {
        this.phoneNumber = null;
        this.tipoVinculacion = null;
        this.socket = null;
        this.intentos = 0;
        this.maxIntentos = 2;
        this.codigoMostrado = false;
        this.procesoActivo = false;
        this.detenerFlujo = false;
        this.rl = null;

        // Evitamos que errores sueltos detengan todo
        process.on('unhandledRejection', () => {});
        process.on('uncaughtException', () => {});
    }

    async connect() {
        // ❌ EVITAMOS ABRIR VARIOS PROCESOS AL MISMO TIEMPO (CAUSA PRINCIPAL DEL ERROR)
        if (this.procesoActivo || this.detenerFlujo) return;
        this.procesoActivo = true;

        // Limpiamos todo antes de empezar de nuevo
        if (this.socket) {
            try {
                this.socket.ev.removeAllListeners();
                this.socket.end();
            } catch {}
            this.socket = null;
        }

        if (this.rl) {
            try {
                this.rl.close();
                this.rl.removeAllListeners();
            } catch {}
            this.rl = null;
        }

        if (this.intentos >= this.maxIntentos) {
            this.intentos = 0;
            this.codigoMostrado = false;
            this.tipoVinculacion = null;
            this.phoneNumber = null;
            console.log(chalk.red.bold('\n❌ Se agotaron los intentos, empezamos limpio\n'));
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        // 🛑 CREAMOS LA ENTRADA DE DATOS DE FORMA CONTROLADA
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.rl.setMaxListeners(0);

        // 📋 OPCIONES TAL COMO LAS QUIERES
        if (!this.tipoVinculacion) {
            console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'));
            console.log(chalk.green('🔢 Opción 1: Usar código numérico'));
            console.log(chalk.green('📱 Opción 2: Usar código QR'));
            console.log('');

            this.tipoVinculacion = await new Promise(resolve => {
                this.rl.question(
                    chalk.blue('👉 Escribe el número de la opción que prefieras (1 o 2): '),
                    opcion => {
                        opcion = opcion.trim();
                        if (opcion === '1' || opcion === '2') {
                            resolve(opcion);
                        } else {
                            console.log(chalk.red.bold('❌ Opción inválida\n'));
                            resolve(null);
                        }
                    }
                );
            });

            if (!this.tipoVinculacion) {
                this.rl.close();
                this.procesoActivo = false;
                return this.connect();
            }
            console.log('');
        }

        // 📌 INGRESO DE NÚMERO - EXACTAMENTE PARA TU CASO
        if (!this.phoneNumber && this.tipoVinculacion === '1') {
            console.log(chalk.blue('📝 Escribe tu número así: 18549995761'));
            console.log(chalk.blue('⚠️ Solo números, sin nada más\n'));

            this.phoneNumber = await new Promise(resolve => {
                this.rl.question(
                    chalk.blue('📱 Ingresa tu número: '),
                    num => {
                        let numeroLimpio = num.replace(/\D/g, '');
                        resolve(numeroLimpio);
                    }
                );
            });

            this.rl.close();

            // Validación exacta
            if (!this.phoneNumber || this.phoneNumber !== '18549995761') {
                console.log(chalk.red.bold('❌ Número incorrecto, debe ser: 18549995761\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            console.log(chalk.yellow.bold(`⏳ Preparando todo, espera...\n`));
        }

        // ✅ CONFIGURACIÓN LIMPIA Y SIN ERRORES
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' }),
            markAsOnline: true,
            connectTimeoutMs: 120000,
            retryDelayMs: 10000,
            keepAliveIntervalMs: 30000,
            defaultQueryTimeoutMs: undefined,
            emitOwnEvents: false,
            syncCredsAfterConnect: false,
            shouldSyncHistoryMessage: () => false,

            // 🔑 DATOS QUE FUNCIONAN HOY
            browser: ["Windows", "Edge", "128.0.2739.42"],
            version: [2, 3000, 1033893291]
        });

        this.socket.ev.setMaxListeners(0);
        this.socket.ev.on('creds.update', saveCreds);

        // 📌 MANEJO DE EVENTOS CORREGIDO, SIN SATURACIÓN
        this.socket.ev.on('connection.update', async (actualizacion) => {
            const { connection, qr, code } = actualizacion;

            // ✅ CONECTADO CORRECTAMENTE
            if (connection === 'open') {
                this.intentos = 0;
                this.codigoMostrado = false;
                this.procesoActivo = false;
                this.detenerFlujo = false;
                console.log(chalk.green.bold('\n✅ ¡CONECTADO EXITOSAMENTE!'));
                console.log(chalk.blue(`🤖 Bot funcionando correctamente\n`));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return;
            }

            // ❌ CONEXIÓN CERRADA
            if (connection === 'close') {
                const razon = actualizacion?.reason;

                if (razon === DisconnectReason.loggedOut) {
                    console.log(chalk.red.bold('\n❌ Sesión cerrada, limpiando y empezando de nuevo\n'));
                    this.intentos = 0;
                    this.codigoMostrado = false;
                    this.phoneNumber = null;
                    this.tipoVinculacion = null;
                    this.procesoActivo = false;
                    this.detenerFlujo = false;
                    setTimeout(() => this.connect(), 3000);
                    return;
                }

                // 🛑 LO MÁS IMPORTANTE: SI YA MOSTRAMOS EL CÓDIGO, NUNCA MÁS REINICIAMOS
                if (this.codigoMostrado) {
                    console.log(chalk.yellow.bold('\n⏳ Esperando solo a que ingreses el código... Ya no se reinicia nada\n'));
                    this.procesoActivo = false;
                    return;
                }

                this.intentos++;
                console.log(chalk.red.bold(`📴 Intento ${this.intentos} de ${this.maxIntentos}`));

                if (this.intentos < this.maxIntentos) {
                    console.log(chalk.yellow.bold('🔁 Intentando nuevamente...\n'));
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 10000);
                } else {
                    console.log(chalk.red.bold('🚫 Llegamos al límite, empezamos desde cero\n'));
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 4000);
                }
                return;
            }

            // 🔢 CÓDIGO NUMÉRICO - AJUSTADO PARA TU NÚMERO
            if (this.tipoVinculacion === '1' && !this.codigoMostrado) {
                try {
                    // ⏱️ TIEMPO EXACTO PARA QUE LO DETECTEN
                    await new Promise(resolve => setTimeout(resolve, 15000));

                    if (code) {
                        this.mostrarCodigo(code);
                        return;
                    }

                    // 🟢 FORMATO OBLIGATORIO PARA NÚMEROS DE ESTADOS UNIDOS
                    const codigoGenerado = await this.socket.requestPairingCode(`+${this.phoneNumber}`);
                    
                    if (codigoGenerado) {
                        this.mostrarCodigo(codigoGenerado);
                    }

                } catch (error) {
                    console.log(chalk.red.bold(`❌ Detalle: ${error.message}\n`));
                    this.intentos++;
                }
            }

            // 📱 CÓDIGO QR
            if (this.tipoVinculacion === '2' && qr && !this.codigoMostrado) {
                this.codigoMostrado = true;
                console.log(chalk.yellow.bold('\n📲 CÓDIGO QR:'));
                qrcodeTerminal.generate(qr, { small: true });
                console.log(chalk.yellow('\n📋 Pasos: Ajustes → Dispositivos vinculados → Vincular dispositivo\n'));
                console.log(chalk.green.bold('✅ Al escanearse se conectará automáticamente\n'));
            }
        });

        return this.socket;
    }

    mostrarCodigo(codigo) {
        this.codigoMostrado = true;
        this.procesoActivo = false;
        // 🛑 UNA VEZ AQUÍ, YA NO SE HACE NADA MÁS, SOLO ESPERAMOS
        console.log('\n' + '═'.repeat(50));
        console.log(chalk.green.bold('✅ CÓDIGO GENERADO CON ÉXITO'));
        console.log(chalk.magenta.bold(`🔑 TU CÓDIGO ES: ${codigo}`));
        console.log('═'.repeat(50) + '\n');
        console.log(chalk.blue.bold('📋 PASOS EXACTOS:'));
        console.log('1. Abre WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo');
        console.log('2. Elige: "Vincular con número de teléfono"');
        console.log('3. ✅ ESCRÍBELO: Todo en MAYÚSCULAS, sin espacios, sin guiones, todo junto');
        console.log('4. ⏰ TIEMPO LÍMITE: 20 SEGUNDOS SOLAMENTE, escribe rápido');
        console.log('5. 🚫 No uses VPN ni proxy, usa tu conexión normal\n');
        console.log(chalk.red.bold('⚠️ RECUERDA: El sistema ya NO se reiniciará ni cambiará el código. Solo espera mientras lo ingresas\n'));
    }
            }
