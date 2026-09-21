import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

BorderSurface {
  id: root

  property int launcherIndex: 0
  property string launcherName: ""
  property string launcherCommand: ""
  property color contentForeground: Color.foreground
  property string contentFontFamily: Style.font.family

  signal nameModified(string newName)
  signal commandModified(string newCommand)
  signal removeRequested()

  readonly property bool isEditing: nameInput.activeFocus || commandInput.activeFocus

  implicitHeight: launcherCardCol.implicitHeight + Style.space(16)
  radius: Style.cornerRadius
  color: Style.normalFillFor(root.contentForeground, Color.accent)
  borderSpec: Border.controlSpec("normal", root.contentForeground, Color.accent)

  Column {
    id: launcherCardCol
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    anchors.margins: Style.space(8)
    spacing: Style.space(6)

    Item {
      width: parent.width
      height: Math.max(launcherCardTitle.implicitHeight, deleteLauncherBtn.height)

      Text {
        id: launcherCardTitle
        anchors.left: parent.left
        anchors.right: deleteLauncherBtn.left
        anchors.rightMargin: Style.space(8)
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: "Launcher " + (root.launcherIndex + 1) + (root.launcherName ? (" · " + root.launcherName) : "")
        color: root.contentForeground
        font.family: root.contentFontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        elide: Text.ElideRight
      }

      PanelActionButton {
        id: deleteLauncherBtn
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        iconText: "✕"
        fontSize: Style.font.caption
        hoverColor: Color.urgent
        tooltipText: "Remove launcher"
        foreground: root.contentForeground
        fontFamily: root.contentFontFamily
        onClicked: root.removeRequested()
      }
    }

    TextField {
      id: nameInput
      width: parent.width
      text: root.launcherName
      placeholderText: "Name (e.g. work, personal, teams)"
      foreground: root.contentForeground
      font.family: root.contentFontFamily
      font.pixelSize: Style.font.bodySmall
      onEditingFinished: root.nameModified(text.trim())
      Keys.onPressed: function(e) { if (e.key === Qt.Key_Escape) { focus = false; e.accepted = true } }
    }

    TextField {
      id: commandInput
      width: parent.width
      text: root.launcherCommand
      placeholderText: "Command (e.g. google-chrome-stable --profile-directory=\"Profile 2\")"
      foreground: root.contentForeground
      font.family: root.contentFontFamily
      font.pixelSize: Style.font.bodySmall
      onEditingFinished: root.commandModified(text.trim())
      Keys.onPressed: function(e) { if (e.key === Qt.Key_Escape) { focus = false; e.accepted = true } }
    }
  }
}
