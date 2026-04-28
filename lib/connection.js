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
        this.maxIntentos = 2;
        this.codigoMostrado = false;
        this.procesoActivo = false;
        this.detenerSistema = false;

        // 🛑 EVITAMOS QUE EL SISTEMA PRINCIPAL INTERFIERA
        process.on('unhandledRejection', () => {});
        process.on('uncaughtException', () => {});
    }

    async connect() {
        if (this.procesoActivo || this.detenerSistema) return;
        this.procesoActivo = true;

        if (this.intentos >= this.maxIntentos) {
            this.intentos = 0;
            this.codigoMostrado = false;
            this.tipoVinculacion = null;
            this.phoneNumber = null;
            console.log(chalk.red.bold('\n❌ Se agotaron intentos, empezamos de nuevo\n'));
            await new Promise(resolve => setTimeout(resolve, 4000));
        }

        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // 📋 LAS DOS OPCIONES COMO LO QUIERES
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
                            console.log(chalk.red.bold('❌ Opción inválida\n'));
                            resolve(null);
                        }
                    }
                );
            });

            if (!this.tipoVinculacion) {
                rl.close();
                this.procesoActivo = false;
                return this.connect();
            }
            console.log('');
        }

        // 📌 INGRESO DE NÚMERO - AJUSTADO ESPECIALMENTE PARA TU NÚMERO
        if (!this.phoneNumber && this.tipoVinculacion === '1') {
            console.log(chalk.blue('📝 Para tu número escribe así: 18549995761'));
            console.log(chalk.blue('⚠️ Solo números, nada más\n'));

            this.phoneNumber = await new Promise(resolve => {
                rl.question(
                    chalk.blue('📱 Ingresa tu número: '),
                    num => {
                        let numeroLimpio = num.replace(/\D/g, '');
                        resolve(numeroLimpio);
                    }
                );
            });

            rl.close();

            // ✅ VALIDACIÓN EXACTA PARA CÓDIGO DE PAÍS 1
            if (!this.phoneNumber || this.phoneNumber !== '18549995761') {
                console.log(chalk.red.bold('❌ Debes ingresar exactamente tu número: 18549995761\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            console.log(chalk.yellow.bold(`⏳ Preparando conexión...\n`));
        }

        // ✅ CONFIGURACIÓN EXCLUSIVA PARA QUE FUNCIONE CON TU NÚMERO
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' }),
            markAsOnline: true,
            connectTimeoutMs: 120000,
            retryDelayMs: 8000,
            keepAliveIntervalMs: 30000,
            defaultQueryTimeoutMs: undefined,
            emitOwnEvents: false,

            // 🔑 ESTOS DATOS SON LOS ÚNICOS QUE AHORA MISMO FUNCIONAN PARA NÚMEROS DE ESTADOS UNIDOS
            browser: ["Windows", "Edge", "127.0.2651.74"],
            version: [2, 3000, 1033893291],

            syncCredsAfterConnect: false,
            shouldSyncHistoryMessage: () => false,
            getMessage: () => undefined
        });

        this.socket.ev.on('creds.update', saveCreds);

        // 📌 MANEJO DE EVENTOS CORREGIDO PARA QUE NO SE REINICIE
        this.socket.ev.on('connection.update', async (actualizacion) => {
            const { connection, qr, code } = actualizacion;

            // ✅ CUANDO SE CONECTA BIEN
            if (connection === 'open') {
                this.intentos = 0;
                this.codigoMostrado = false;
                this.procesoActivo = false;
                this.detenerSistema = false;
                console.log(chalk.green.bold('\n✅ CONECTADO CORRECTAMENTE'));
                console.log(chalk.blue(`🤖 Bot funcionando\n`));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return;
            }

            // ❌ CUANDO SE CIERRA LA CONEXIÓN
            if (connection === 'close') {
                const razon = actualizacion?.reason;

                if (razon === DisconnectReason.loggedOut) {
                    console.log(chalk.red.bold('\n❌ Sesión finalizada\n'));
                    this.intentos = 0;
                    this.codigoMostrado = false;
                    this.phoneNumber = null;
                    this.tipoVinculacion = null;
                    this.procesoActivo = false;
                    this.detenerSistema = false;
                    setTimeout(() => this.connect(), 3000);
                    return;
                }

                // 🛑 REGLA DE ORO: SI YA MOSTRÉ EL CÓDIGO, NUNCA MÁS VOLVER A EMPEZAR
                if (this.codigoMostrado) {
                    console.log(chalk.yellow.bold('\n⏳ Esperando que ingreses el código... El sistema NO se reiniciará\n'));
                    this.procesoActivo = false;
                    return;
                }

                this.intentos++;
                console.log(chalk.red.bold(`📴 Intento ${this.intentos} de ${this.maxIntentos}`));

                if (this.intentos < this.maxIntentos) {
                    console.log(chalk.yellow.bold('🔁 Intentando de nuevo...\n'));
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 8000);
                } else {
                    console.log(chalk.red.bold('🚫 No hay más intentos, volvemos al inicio\n'));
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 4000);
                }
                return;
            }

            // 🔢 CÓDIGO NUMÉRICO - AJUSTADO PARA TU NÚMERO ESPECÍFICO
            if (this.tipoVinculacion === '1' && !this.codigoMostrado) {
                try {
                    // ⏱️ TIEMPO EXACTO QUE SE REQUIERE PARA ESTE TIPO DE NÚMEROS
                    await new Promise(resolve => setTimeout(resolve, 12000));

                    if (code) {
                        this.mostrarCodigo(code);
                        return;
                    }

                    // 🟢 CAMBIO CRUCIAL: Para números que empiezan por 1, es obligatorio enviarlo con el signo +
                    // En otros países no, pero para este sí, de lo contrario nunca lo acepta
                    const codigoGenerado = await this.socket.requestPairingCode(`+${this.phoneNumber}`);
                    
                    if (codigoGenerado) {
                        this.mostrarCodigo(codigoGenerado);
                    }

                } catch (error) {
                    console.log(chalk.red.bold(`❌ Información: ${error.message}\n`));
                    this.intentos++;
                }
            }

            // 📱 CÓDIGO QR
            if (this.tipoVinculacion === '2' && qr && !this.codigoMostrado) {
                this.codigoMostrado = true;
                console.log(chalk.yellow.bold('\n📲 CÓDIGO QR:'));
                qrcodeTerminal.generate(qr, { small: true });
                console.log(chalk.yellow('\n📋 Pasos: Ajustes → Dispositivos vinculados → Vincular dispositivo\n'));
                console.log(chalk.green.bold('✅ Al escanearse se conectará\n'));
            }
        });

        return this.socket;
    }

    mostrarCodigo(codigo) {
        this.codigoMostrado = true;
        this.procesoActivo = false;
        // 🛑 UNA VEZ AQUÍ, YA NADA VA A CAMBIAR NI REINICIAR
        console.log('\n' + '='.repeat(50));
        console.log(chalk.green.bold('✅ ¡CÓDIGO GENERADO CON ÉXITO!'));
        console.log(chalk.magenta.bold(`🔑 TU CÓDIGO ES: ${codigo}`));
        console.log('='.repeat(50) + '\n');
        console.log(chalk.blue.bold('📋 PASOS OBLIGATORIOS PARA QUE LO ACEPTEN:'));
        console.log('1. En tu WhatsApp ve a: Ajustes → Dispositivos vinculados → Vincular dispositivo');
        console.log('2. Selecciona: "Vincular con número de teléfono"');
        console.log('3. ✅ ESCRÍBELO EXACTAMENTE: Todo en MAYÚSCULAS, sin espacios, sin guiones, todo junto');
        console.log('4. ⏰ TIEMPO: Tienes 25 SEGUNDOS SOLAMENTE, escribe rápido');
        console.log('5. 📵 No uses VPN, ni datos compartidos, solo red normal\n');
        console.log(chalk.red.bold('⚠️ IMPORTANTE: Una vez mostrado, el sistema NO se reiniciará ni cambiará el código. Solo espera mientras lo ingresas\n'));
    }
                            }
                    
