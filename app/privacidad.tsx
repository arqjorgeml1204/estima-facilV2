import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

export default function PrivacidadScreen() {
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e1e2e4', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={24} color="#191c1e" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#191c1e' }}>Aviso de Privacidad</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>

        <Text style={{ fontSize: 11, color: '#737685', marginBottom: 20 }}>
          {'\u00daltima actualizaci\u00f3n: abril de 2026'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'1. IDENTIDAD Y DOMICILIO DEL RESPONSABLE'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'En cumplimiento de lo dispuesto por la Ley Federal de Protecci\u00f3n de Datos Personales en Posesi\u00f3n de los Particulares (LFPDPPP), su Reglamento y los Lineamientos del Aviso de Privacidad emitidos por el Instituto Nacional de Transparencia, Acceso a la Informaci\u00f3n y Protecci\u00f3n de Datos Personales (INAI), se pone a su disposici\u00f3n el presente Aviso de Privacidad.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Responsable del tratamiento de sus datos personales:\n\nNombre: Jorge Osvaldo Mart\u00ednez L\u00f3pez\nCorreo electr\u00f3nico: arq.jorgeml@gmail.com\nTel\u00e9fono de contacto: +52 228 410 4931\n\n(En adelante, el \u201cResponsable\u201d)'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'2. DATOS PERSONALES QUE SE RECABAN'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Para las finalidades se\u00f1aladas en el presente Aviso de Privacidad, el Responsable recaba los siguientes datos personales:\n\na) Nombre completo del usuario.\nb) Correo electr\u00f3nico O n\u00famero de tel\u00e9fono celular (solo uno de ellos, seg\u00fan lo proporcione el usuario al momento de su registro).'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El Responsable hace de su conocimiento que NO se recaban datos personales sensibles en ning\u00fan momento. No se recopilan datos patrimoniales del usuario, datos de salud, datos biom\u00e9tricos, datos de origen \u00e9tnico o racial, opiniones pol\u00edticas, convicciones religiosas, filos\u00f3ficas o morales, afiliaci\u00f3n sindical, preferencia sexual, ni ning\u00fan otro dato considerado sensible por la LFPDPPP.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Los datos de proyectos de construcci\u00f3n del usuario (estimaciones, importes, cantidades de obra, evidencias fotogr\u00e1ficas, croquis y dem\u00e1s informaci\u00f3n t\u00e9cnica) se almacenan \u00fanicamente de forma local en el dispositivo m\u00f3vil del usuario mediante tecnolog\u00edas SQLite y AsyncStorage. Estos datos NO son recabados, tratados, almacenados ni accedidos por el Responsable en ning\u00fan momento.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'3. FINALIDADES DEL TRATAMIENTO'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Los datos personales que recabamos ser\u00e1n utilizados para las siguientes finalidades, las cuales son necesarias para la prestaci\u00f3n del servicio contratado (finalidades primarias):\n\na) Identificaci\u00f3n y autenticaci\u00f3n del usuario para el acceso a la aplicaci\u00f3n m\u00f3vil EstimaF\u00e1cil\u00ae.\n\nb) Gesti\u00f3n, verificaci\u00f3n y control de la suscripci\u00f3n contratada por el usuario, incluyendo la administraci\u00f3n de periodos de prueba, planes mensuales y anuales.\n\nc) Generaci\u00f3n y env\u00edo del c\u00f3digo de activaci\u00f3n de la suscripci\u00f3n al usuario.\n\nd) Comunicaciones relacionadas directamente con el servicio contratado, tales como avisos de vencimiento de suscripci\u00f3n, actualizaciones de la App y notificaciones sobre cambios en los T\u00e9rminos y Condiciones o en el presente Aviso de Privacidad.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Finalidades secundarias (no necesarias para la prestaci\u00f3n del servicio): Ninguna. El Responsable NO utiliza los datos personales del usuario para fines publicitarios, mercadot\u00e9cnicos, de perfilamiento comercial ni los comparte con anunciantes o terceros con fines promocionales.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'4. TRANSFERENCIA DE DATOS'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El Responsable NO transfiere datos personales a terceros nacionales ni internacionales, salvo en los siguientes supuestos:\n\na) Cuando sea requerido por autoridad competente en los t\u00e9rminos que establece la legislaci\u00f3n mexicana aplicable, de conformidad con el art\u00edculo 37, fracci\u00f3n IV de la LFPDPPP.\n\nb) Cuando sea necesario para la prestaci\u00f3n del servicio, espec\u00edficamente para el env\u00edo de notificaciones y comunicaciones al usuario a trav\u00e9s del servicio de mensajer\u00eda WhatsApp al n\u00famero de tel\u00e9fono proporcionado por el usuario, en cuyo caso dicha comunicaci\u00f3n transitar\u00e1 por la plataforma de Meta Platforms, Inc. conforme a sus propias pol\u00edticas de privacidad.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'5. DERECHOS ARCO'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Usted, como titular de sus datos personales, tiene derecho a Acceder a los datos personales que obran en poder del Responsable, Rectificarlos en caso de ser inexactos o incompletos, Cancelarlos cuando considere que no se requieren para alguna de las finalidades se\u00f1aladas en este Aviso, u Oponerse al tratamiento de los mismos para fines espec\u00edficos (Derechos ARCO), conforme a lo establecido en los art\u00edculos 28 al 35 de la LFPDPPP.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Para ejercer sus Derechos ARCO, deber\u00e1 enviar una solicitud al correo electr\u00f3nico arq.jorgeml@gmail.com con el asunto \u201cARCO - EstimaF\u00e1cil\u201d, incluyendo la siguiente informaci\u00f3n:\n\na) Nombre completo del titular de los datos.\nb) Correo electr\u00f3nico o n\u00famero de tel\u00e9fono registrado en la App.\nc) Descripci\u00f3n clara y precisa del derecho ARCO que desea ejercer y los datos personales a los que se refiere.\nd) Copia digitalizada de identificaci\u00f3n oficial vigente (credencial para votar, pasaporte o c\u00e9dula profesional).\ne) Cualquier documento o informaci\u00f3n que facilite la localizaci\u00f3n de sus datos personales.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El Responsable dar\u00e1 respuesta a su solicitud en un plazo m\u00e1ximo de 20 (veinte) d\u00edas h\u00e1biles contados a partir de la fecha en que se recibi\u00f3 la solicitud completa, de conformidad con el art\u00edculo 32 de la LFPDPPP. La respuesta se comunicar\u00e1 a trav\u00e9s del correo electr\u00f3nico proporcionado en la solicitud. En caso de resultar procedente, la solicitud se har\u00e1 efectiva dentro de los 15 (quince) d\u00edas h\u00e1biles siguientes a la fecha de la respuesta.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'6. REVOCACI\u00d3N DEL CONSENTIMIENTO'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Usted puede revocar su consentimiento para el tratamiento de sus datos personales en cualquier momento, sin efectos retroactivos, enviando una solicitud al correo electr\u00f3nico arq.jorgeml@gmail.com con el asunto \u201cRevocaci\u00f3n de consentimiento - EstimaF\u00e1cil\u201d, conforme al procedimiento y requisitos establecidos en la secci\u00f3n anterior de Derechos ARCO.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Es importante que tenga en cuenta que, en ciertos casos, la revocaci\u00f3n de su consentimiento podr\u00e1 implicar que no sea posible continuar prest\u00e1ndole el servicio de la App, toda vez que el tratamiento de ciertos datos personales es indispensable para la operaci\u00f3n del mismo. El Responsable le informar\u00e1 sobre las consecuencias de la revocaci\u00f3n al momento de procesar su solicitud.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'7. USO DE TECNOLOG\u00cdAS DE RASTREO'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'La aplicaci\u00f3n m\u00f3vil EstimaF\u00e1cil\u00ae NO utiliza cookies, web beacons, p\u00edxeles de rastreo ni tecnolog\u00edas similares de seguimiento en l\u00ednea.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'La App utiliza almacenamiento local del dispositivo m\u00f3vil del usuario mediante las tecnolog\u00edas SQLite y AsyncStorage. Este almacenamiento local se utiliza exclusivamente para el funcionamiento interno de la aplicaci\u00f3n, incluyendo: el mantenimiento de la sesi\u00f3n del usuario, el almacenamiento de datos de proyectos de obra, y la conservaci\u00f3n de las preferencias y configuraci\u00f3n del usuario.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Este almacenamiento local reside \u00fanicamente en el dispositivo del usuario y NO es accesible, legible ni transferible por el Responsable. El Responsable no tiene capacidad t\u00e9cnica para acceder a estos datos almacenados localmente.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'8. CAMBIOS AL AVISO DE PRIVACIDAD'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El Responsable se reserva el derecho de modificar el presente Aviso de Privacidad en cualquier momento para adaptarlo a novedades legislativas, criterios jurisprudenciales, pr\u00e1cticas de la industria o por cualquier otra causa.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Cualquier cambio sustancial al presente Aviso ser\u00e1 notificado al usuario a trav\u00e9s de la aplicaci\u00f3n m\u00f3vil EstimaF\u00e1cil\u00ae. La versi\u00f3n actualizada del Aviso de Privacidad estar\u00e1 disponible en todo momento en la pantalla de \u201cAviso de Privacidad\u201d dentro de la App. Se recomienda al usuario revisar peri\u00f3dicamente este Aviso para mantenerse informado sobre la protecci\u00f3n de sus datos personales.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'9. AUTORIDAD'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Si usted considera que su derecho a la protecci\u00f3n de datos personales ha sido lesionado por alguna conducta u omisi\u00f3n del Responsable, o presume que en el tratamiento de sus datos personales existe alguna violaci\u00f3n a las disposiciones previstas en la LFPDPPP y/o su Reglamento, podr\u00e1 interponer la queja o denuncia correspondiente ante el Instituto Nacional de Transparencia, Acceso a la Informaci\u00f3n y Protecci\u00f3n de Datos Personales (INAI).'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Para mayor informaci\u00f3n, visite: www.inai.org.mx o comun\u00edquese al tel\u00e9fono 800 835 4324 (INAI).'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'10. FECHA DE \u00daLTIMA ACTUALIZACI\u00d3N'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El presente Aviso de Privacidad fue actualizado por \u00faltima vez en abril de 2026.'}
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}
