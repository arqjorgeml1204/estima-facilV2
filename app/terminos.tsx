import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

export default function TerminosScreen() {
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e1e2e4', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={24} color="#191c1e" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#191c1e' }}>{'T\u00e9rminos y Condiciones'}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>

        <Text style={{ fontSize: 11, color: '#737685', marginBottom: 20 }}>
          {'\u00daltima actualizaci\u00f3n: abril de 2026'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'1. ACEPTACI\u00d3N DE LOS T\u00c9RMINOS'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Los presentes T\u00e9rminos y Condiciones (en adelante, los \u201cT\u00e9rminos\u201d) regulan el uso de la aplicaci\u00f3n m\u00f3vil EstimaF\u00e1cil\u00ae (en adelante, la \u201cApp\u201d), desarrollada y operada por Jorge Osvaldo Mart\u00ednez L\u00f3pez (en adelante, el \u201cTitular\u201d), con domicilio de contacto en la ciudad de Xalapa, Veracruz, M\u00e9xico, y correo electr\u00f3nico arq.jorgeml@gmail.com.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Al descargar, instalar, registrarse o utilizar la App de cualquier forma, el usuario manifiesta su consentimiento expreso e inequ\u00edvoco para obligarse conforme a estos T\u00e9rminos, de conformidad con lo dispuesto en los art\u00edculos 1803 y 1834 bis del C\u00f3digo Civil Federal, as\u00ed como en las disposiciones aplicables del C\u00f3digo de Comercio de los Estados Unidos Mexicanos. Si usted no est\u00e1 de acuerdo con alguno de estos T\u00e9rminos, deber\u00e1 abstenerse de utilizar la App.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'2. DESCRIPCI\u00d3N DEL SERVICIO'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'EstimaF\u00e1cil\u00ae es una herramienta digital de apoyo para la gesti\u00f3n, elaboraci\u00f3n y seguimiento de estimaciones de obra en el \u00e1mbito de la construcci\u00f3n residencial. La App permite al usuario registrar avances, generar documentos de estimaci\u00f3n, capturar evidencias fotogr\u00e1ficas y administrar datos de sus proyectos de construcci\u00f3n.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'La App NO constituye, bajo ninguna circunstancia, un servicio de asesor\u00eda t\u00e9cnica, ingenier\u00eda, arquitectura, contable, fiscal ni legal. Los c\u00e1lculos, montos, cantidades de obra y cualquier dato generado o registrado dentro de la App son responsabilidad exclusiva del usuario. El Titular no garantiza la exactitud, integridad ni idoneidad de los resultados obtenidos mediante el uso de la App para ning\u00fan prop\u00f3sito espec\u00edfico.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'3. REGISTRO Y CUENTA DE USUARIO'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Para acceder a las funcionalidades de la App, el usuario deber\u00e1 crear una cuenta proporcionando la informaci\u00f3n solicitada. El usuario se compromete a proporcionar informaci\u00f3n veraz, completa y actualizada, y es el \u00fanico responsable de mantener la confidencialidad de sus credenciales de acceso (usuario y contrase\u00f1a).'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'La App no realiza verificaci\u00f3n de identidad del usuario ante terceros, autoridades gubernamentales ni colegios profesionales. Cualquier actividad realizada desde la cuenta del usuario se presumir\u00e1 efectuada por \u00e9l, por lo que el usuario ser\u00e1 responsable de todos los actos realizados con sus credenciales. En caso de detectar un uso no autorizado de su cuenta, el usuario deber\u00e1 notificarlo de inmediato al Titular al correo arq.jorgeml@gmail.com.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'4. PLANES DE SUSCRIPCI\u00d3N Y PAGOS'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'La App ofrece los siguientes planes de suscripci\u00f3n:\n\na) Periodo de prueba gratuito (Trial): 14 d\u00edas naturales con acceso completo a todas las funcionalidades, sin obligaci\u00f3n de pago. Al t\u00e9rmino del periodo de prueba, el acceso a las funcionalidades premium se suspender\u00e1 autom\u00e1ticamente.\n\nb) Plan Mensual: $2,499.00 MXN (dos mil cuatrocientos noventa y nueve pesos 00/100 M.N.) por un periodo de 30 d\u00edas naturales.\n\nc) Plan Anual: $24,999.00 MXN (veinticuatro mil novecientos noventa y nueve pesos 00/100 M.N.) por un periodo de 365 d\u00edas naturales.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Los precios indicados incluyen el Impuesto al Valor Agregado (IVA) cuando sea aplicable. Los pagos se realizan de manera manual mediante transferencia bancaria o pago en efectivo, conforme a las instrucciones proporcionadas por el Titular. Una vez que el pago ha sido verificado y el c\u00f3digo de activaci\u00f3n ha sido generado y entregado al usuario, no se realizar\u00e1n reembolsos bajo ninguna circunstancia, en t\u00e9rminos de lo dispuesto por el art\u00edculo 1796 del C\u00f3digo Civil Federal.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El Titular se reserva el derecho de modificar los precios de los planes de suscripci\u00f3n en cualquier momento. Cualquier cambio en los precios ser\u00e1 notificado al usuario con al menos 30 (treinta) d\u00edas naturales de anticipaci\u00f3n mediante aviso dentro de la App. Las suscripciones vigentes al momento del cambio mantendr\u00e1n su precio original hasta su vencimiento.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'5. PROPIEDAD INTELECTUAL'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'EstimaF\u00e1cil\u00ae, incluyendo pero no limit\u00e1ndose a su nombre comercial, logotipo, c\u00f3digo fuente, c\u00f3digo objeto, arquitectura de software, dise\u00f1o gr\u00e1fico, interfaces de usuario, bases de datos, documentaci\u00f3n t\u00e9cnica, textos, im\u00e1genes y dem\u00e1s elementos que componen la App, son propiedad exclusiva de Jorge Osvaldo Mart\u00ednez L\u00f3pez y se encuentran protegidos por la Ley Federal del Derecho de Autor, la Ley de la Propiedad Industrial y los tratados internacionales de los que M\u00e9xico es parte.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Queda estrictamente prohibida la reproducci\u00f3n, distribuci\u00f3n, comunicaci\u00f3n p\u00fablica, transformaci\u00f3n, ingenier\u00eda inversa, descompilaci\u00f3n, desensamblaje o cualquier otro uso comercial o no comercial del contenido de la App sin la autorizaci\u00f3n previa y por escrito del Titular. La violaci\u00f3n a estos derechos ser\u00e1 sancionada conforme a la legislaci\u00f3n aplicable y dar\u00e1 lugar a las acciones civiles y penales correspondientes.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'6. LIMITACI\u00d3N DE RESPONSABILIDAD'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'La App se proporciona \u201ctal cual est\u00e1\u201d (as-is) y \u201cseg\u00fan disponibilidad\u201d (as-available), sin garant\u00edas de ning\u00fan tipo, ya sean expresas o impl\u00edcitas, incluyendo, sin limitaci\u00f3n, garant\u00edas de comerciabilidad, idoneidad para un fin particular o no infracci\u00f3n de derechos de terceros.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'En la m\u00e1xima medida permitida por la legislaci\u00f3n mexicana aplicable, el Titular no ser\u00e1 responsable por ning\u00fan da\u00f1o directo, indirecto, incidental, especial, consecuente o punitivo que surja del uso o la imposibilidad de uso de la App, incluyendo, de manera enunciativa mas no limitativa: p\u00e9rdidas econ\u00f3micas en proyectos de construcci\u00f3n, errores en c\u00e1lculos de estimaciones, p\u00e9rdida de datos, interrupciones del servicio, da\u00f1os al dispositivo m\u00f3vil o cualquier otro perjuicio derivado directa o indirectamente del uso de la App.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El usuario reconoce y acepta que utiliza la App bajo su propio riesgo y responsabilidad, y que es su obligaci\u00f3n verificar de manera independiente la exactitud de cualquier c\u00e1lculo, estimaci\u00f3n o dato generado mediante la App antes de utilizarlo para tomar decisiones profesionales, contractuales o econ\u00f3micas.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'7. ALMACENAMIENTO DE DATOS'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Los proyectos, estimaciones, evidencias fotogr\u00e1ficas, croquis y dem\u00e1s datos de obra registrados por el usuario se almacenan exclusivamente de manera local en el dispositivo m\u00f3vil del usuario, utilizando tecnolog\u00edas de almacenamiento local (SQLite y AsyncStorage).'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El Titular NO tiene acceso a los datos de proyectos del usuario, NO los almacena en servidores propios ni de terceros, y NO realiza respaldos de dicha informaci\u00f3n. En consecuencia, el usuario es el \u00fanico responsable de realizar respaldos peri\u00f3dicos de su informaci\u00f3n. El Titular no ser\u00e1 responsable por la p\u00e9rdida de datos derivada de fallas del dispositivo, desinstalaci\u00f3n de la App, actualizaciones del sistema operativo o cualquier otra causa.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'8. CONDUCTA PROHIBIDA'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El usuario se obliga a no realizar ninguna de las siguientes conductas:\n\na) Utilizar la App para actividades il\u00edcitas, fraudulentas o contrarias a la legislaci\u00f3n vigente en los Estados Unidos Mexicanos.\n\nb) Intentar acceder de manera no autorizada a los sistemas, servidores o redes relacionados con la App, o vulnerar sus mecanismos de seguridad.\n\nc) Compartir, transferir o ceder sus credenciales de acceso (usuario y contrase\u00f1a) a terceros.\n\nd) Realizar ingenier\u00eda inversa, descompilar, desensamblar o intentar obtener el c\u00f3digo fuente de la App por cualquier medio.\n\ne) Utilizar mecanismos automatizados (bots, scrapers u otros) para interactuar con la App.\n\nf) Reproducir, duplicar, copiar, vender o explotar comercialmente cualquier parte de la App sin autorizaci\u00f3n expresa y por escrito del Titular.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El incumplimiento de cualquiera de estas obligaciones facultar\u00e1 al Titular para suspender o cancelar la cuenta del usuario de forma inmediata y sin previo aviso, sin perjuicio de las acciones legales que correspondan.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'9. MODIFICACIONES A LOS T\u00c9RMINOS'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El Titular se reserva el derecho de modificar, actualizar o complementar los presentes T\u00e9rminos en cualquier momento. Cualquier modificaci\u00f3n sustancial ser\u00e1 notificada al usuario a trav\u00e9s de la App con al menos 30 (treinta) d\u00edas naturales de anticipaci\u00f3n a su entrada en vigor. La versi\u00f3n actualizada de los T\u00e9rminos estar\u00e1 disponible en todo momento dentro de la secci\u00f3n correspondiente de la App.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El uso continuado de la App con posterioridad a la entrada en vigor de las modificaciones constituir\u00e1 la aceptaci\u00f3n plena e incondicional de los T\u00e9rminos modificados por parte del usuario.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'10. TERMINACI\u00d3N'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El Titular podr\u00e1 suspender o cancelar la cuenta de cualquier usuario que incumpla estos T\u00e9rminos, sin necesidad de previo aviso, resoluci\u00f3n judicial o administrativa, y sin responsabilidad alguna para el Titular, de conformidad con lo dispuesto por el art\u00edculo 1949 del C\u00f3digo Civil Federal.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'El usuario podr\u00e1 dejar de utilizar la App en cualquier momento. La terminaci\u00f3n de la cuenta no dar\u00e1 derecho a reembolso alguno por el tiempo restante de la suscripci\u00f3n vigente. Las disposiciones relativas a propiedad intelectual, limitaci\u00f3n de responsabilidad y ley aplicable sobrevivir\u00e1n a la terminaci\u00f3n de estos T\u00e9rminos.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'11. LEY APLICABLE Y JURISDICCI\u00d3N'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Los presentes T\u00e9rminos se rigen e interpretan de conformidad con las leyes de los Estados Unidos Mexicanos, incluyendo el C\u00f3digo Civil Federal, el C\u00f3digo de Comercio, la Ley Federal de Protecci\u00f3n al Consumidor (LFPC) y la Ley Federal del Derecho de Autor (LFDA), as\u00ed como sus respectivos reglamentos y disposiciones complementarias.'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Para la interpretaci\u00f3n, cumplimiento y resoluci\u00f3n de cualquier controversia derivada de los presentes T\u00e9rminos, las partes se someten expresa e irrevocablemente a la jurisdicci\u00f3n de los tribunales competentes de la ciudad de Xalapa, Veracruz, M\u00e9xico, renunciando expresamente a cualquier otro fuero que pudiera corresponderles en raz\u00f3n de su domicilio presente o futuro, o por cualquier otra causa.'}
        </Text>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#003d9b', marginTop: 24, marginBottom: 8 }}>
          {'12. CONTACTO'}
        </Text>
        <Text style={{ fontSize: 13, color: '#434654', lineHeight: 22, marginBottom: 10 }}>
          {'Para cualquier duda, aclaraci\u00f3n, comentario o reclamaci\u00f3n relacionada con los presentes T\u00e9rminos o con el uso de la App, el usuario podr\u00e1 contactar al Titular a trav\u00e9s del correo electr\u00f3nico: arq.jorgeml@gmail.com.'}
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}
