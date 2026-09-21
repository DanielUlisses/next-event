import QtQuick
import qs.Commons
import qs.Ui
import "../Model.js" as Model

Column {
  id: root

  property string calendarName: ""
  property string currentLauncher: ""
  property var launcherNames: []
  property color contentForeground: Color.foreground
  property string contentFontFamily: Style.font.family

  signal launcherSelected(string launcherName)

  width: parent ? parent.width : 0
  spacing: Style.space(4)

  Text {
    width: parent.width
    textFormat: Text.PlainText
    text: root.calendarName
    color: root.contentForeground
    font.family: root.contentFontFamily
    font.pixelSize: Style.font.bodySmall
    font.bold: true
    elide: Text.ElideRight
  }

  Flow {
    width: parent.width
    spacing: Style.space(6)

    Repeater {
      model: Model.calendarLauncherOptions(root.launcherNames, root.currentLauncher)

      Button {
        required property string modelData

        text: modelData === "" ? "Default" : modelData
        bordered: true
        selected: root.currentLauncher === modelData
        active: root.currentLauncher === modelData
        foreground: root.contentForeground
        accent: Color.accent
        fontFamily: root.contentFontFamily
        fontSize: Style.font.caption
        horizontalPadding: Style.space(8)
        verticalPadding: Style.space(4)
        onClicked: root.launcherSelected(modelData)
      }
    }
  }
}
