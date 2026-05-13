# CC-Viewer

Claude Code üzerine inşa edilmiş, kendi geliştirme deneyiminden damıtılmış bir Vibe Coding aracı:

1. Yetenek tavanını yükseltir — /ultraPlan ve /ultraReview komutlarını yerel olarak çalıştırırken proje kodunuzun Claude bulutuna tamamen ifşa olmasını engeller;
2. Çoklu cihaz uyumu — mobil cihazlarda programlama (yerel ağ üzerinden), web sürümü çeşitli senaryolara uyum sağlar, tarayıcı eklentilerine veya işletim sistemi bölünmüş ekranına kolayca gömülebilir ve native kurulum paketi de sunulur;
3. Eksiksiz log saklama — Claude Code'un tam payload'unu yakalama ve analiz etme yeteneği sağlar; loglama, sorun analizi, öğrenme ve tersine mühendislik için idealdir;
4. Öğrenme deneyimi paylaşımı — birçok öğrenme materyali ve geliştirme deneyimi biriktirilmiştir (sistemin çeşitli yerlerindeki "?" simgelerine bakın);
5. Native deneyimi korur — yalnızca Claude Code'un yeteneklerini geliştirir, çekirdekte herhangi bir önemli değişiklik yapmaz, native deneyimi korur;
6. Üçüncü taraf model uyumu — deepseek-v4-\*, GLM 5.1, Kimi K2.6 ile uyumludur; yerleşik cc-switch yeteneği ile üçüncü taraf araçlar arasında istediğiniz zaman sıcak geçiş yapabilirsiniz;

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | Türkçe | [Українська](./README.uk.md)

## Kullanım

### Önkoşullar

* nodejs 20.0.0+ sürümünün kurulu olduğundan emin olun; [İndir ve kur](https://nodejs.org)
* claude code'un kurulu olduğundan emin olun; [Kurulum kılavuzu](https://github.com/anthropics/claude-code)

### ccv kurulumu

#### npm üzerinden kurulum

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Homebrew üzerinden kurulum (macOS / Linux için önerilir)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # Güncelleme için bunu kullanın; brew ile kurulan ccv için npm install -g kullanmayın
```

### Başlatma yöntemi

ccv, claude'un doğrudan yerine geçen bir araçtır: tüm parametreler claude'a aktarılır ve aynı zamanda Web Viewer başlatılır.

```bash
ccv                    # == claude (etkileşimli mod)
```

Yazarın en sık kullandığı komut şudur:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv tüm claude code başlatma parametrelerini iletir, istediğiniz gibi birleştirebilirsiniz
```

Programlama modunu başlattıktan sonra web sayfası otomatik olarak açılır.

cc-viewer'ın istemci sürümü de mevcuttur: [İndirme bağlantısı](https://github.com/weiesky/cc-viewer/releases)

### Log modu

Hâlâ claude'un native aracını veya VS Code eklentisini kullanmaya alışkınsanız bu modu kullanın.

Bu modda `claude` çalıştırıldığında

otomatik olarak bir log süreci başlatılır ve istek logları \~/.claude/cc-viewer/*yourproject*/date.jsonl içine kaydedilir

Log modunu başlat:

```bash
ccv -logger
```

Konsol belirli bir portu yazdıramadığında, varsayılan ilk başlangıç portu 127.0.0.1:7008'dir. Birden fazla örnek aynı anda çalışıyorsa portlar sırayla 7009, 7010 şeklinde devam eder.

Log modunu kaldır:

```bash
ccv --uninstall
```

### Sık karşılaşılan sorunların giderilmesi (Troubleshooting)

Eğer başlatma sorunlarıyla karşılaşıyorsanız nihai bir çözüm yolu vardır:
1. Adım: Herhangi bir dizinde claude code'u açın;
2. Adım: claude code'a aşağıdaki içeriği komut olarak verin:

```
我已经安装了cc-viewer这个npm包，但是执行ccv以后仍然无法有效运行。查看cc-viewer的cli.js 和 findcc.js，根据具体的环境，适配本地的claude code的部署方式。适配的时候修改范围尽量约束在findcc.js中。
```

Claude Code'un kendi başına hataları kontrol etmesine izin vermek, başkalarına danışmaktan veya herhangi bir belgeyi okumaktan daha etkilidir!

Yukarıdaki komut tamamlandıktan sonra findcc.js güncellenir. Projenizin sık sık yerel dağıtıma ihtiyacı varsa veya fork edilen kod sık sık kurulum sorunlarını çözmek zorundaysa, bu dosyayı saklayın; bir sonraki seferde doğrudan kopyalayabilirsiniz. Şu aşamada claude code kullanan birçok proje ve şirket mac'te değil, sunucu tarafında barındırılan ortamlarda dağıtım yapıyor, bu yüzden yazar findcc.js dosyasını ayırarak cc-viewer'ın kaynak kodu güncellemelerini takip etmeyi kolaylaştırmıştır.

Not: Bu uygulama claude-code-switch ve claude-code-router ile çakışır; proxy rekabeti sorunu vardır. Bu nedenle kullanırken claude-code-switch ve claude-code-router'ı mutlaka kapatın; cc-viewer içinde eşdeğer proxy hot-reload yeteneği sunulmaktadır.

### Diğer yardımcı komutlar

Bakınız:

```bash
ccv -h
```

### Sessiz mod (Silent Mode)

Varsayılan olarak `ccv`, `claude`'u sararken sessiz moddadır; terminal çıktınızın temiz kalmasını ve native deneyimle uyumlu olmasını sağlar. Tüm loglar arka planda yakalanır ve `http://localhost:7008` adresinden görüntülenebilir.

Yapılandırma tamamlandıktan sonra `claude` komutunu normal şekilde kullanın. İzleme arayüzüne erişmek için `http://localhost:7008` adresini ziyaret edin.

## Özellikler

### Programlama modu

ccv ile başlattıktan sonra şunu göreceksiniz:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

Düzenlemeyi tamamladıktan sonra kod diff'ini doğrudan görüntüleyebilirsiniz:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

Dosyaları açıp manuel olarak programlayabilseniz de, manuel programlama önerilmez — bu, eski moda programlamadır!

### Mobil programlama

Hatta QR kodunu tarayarak mobil cihazlarda programlama yapabilirsiniz:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Mobil programlamaya dair hayallerinizi gerçekleştirin. Ayrıca bir eklenti mekanizması da var — kendi programlama alışkanlıklarınıza göre özelleştirmek isterseniz, ileride eklenti hooks güncellemelerini takip edebilirsiniz.

### Log modu (claude code'un eksiksiz oturumlarını görüntüleyin)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Claude Code'un gönderdiği tüm API isteklerini gerçek zamanlı olarak yakalar; orijinal metin olduğunu, kırpılmış logları değil (bu çok önemli!!!)
* Main Agent ve Sub Agent isteklerini otomatik olarak tanımlar ve etiketler (alt türler: Plan, Search, Bash)
* MainAgent istekleri Body Diff JSON'u destekler; bir önceki MainAgent isteğine göre farkları katlanmış olarak gösterir (yalnızca değişen/yeni alanlar)
* Her istek satır içinde Token kullanım istatistiklerini gösterir (giriş/çıkış Token, önbellek oluşturma/okuma, isabet oranı)
* Claude Code Router (CCR) ve diğer proxy senaryolarıyla uyumludur — API yol kalıbı eşleştirmesi ile yedek bir yol sağlar

### Konuşma modu

Sağ üst köşedeki "Konuşma modu" düğmesine tıklayarak Main Agent'ın tam konuşma geçmişini sohbet arayüzü olarak ayrıştırın:

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* Agent Team gösterimi henüz desteklenmiyor
* Kullanıcı mesajları sağa hizalı (mavi balonlar), Main Agent yanıtları sola hizalı (koyu balonlar)
* `thinking` blokları varsayılan olarak katlıdır, Markdown olarak işlenir; düşünme sürecini görüntülemek için tıklayın; tek tıkla çeviri desteği vardır (özellik henüz kararsız)
* Kullanıcı seçim mesajları (AskUserQuestion) soru-cevap biçiminde gösterilir
* Çift yönlü mod senkronizasyonu: konuşma moduna geçildiğinde seçili isteğe karşılık gelen konuşmaya otomatik olarak konumlanır; orijinal moda geri dönüldüğünde seçili isteğe otomatik olarak konumlanır
* Ayarlar paneli: araç sonuçları ve thinking bloklarının varsayılan katlama durumu değiştirilebilir
* Mobilde konuşma görüntüleme: mobil CLI modunda üst çubuktaki "Konuşma görüntüleme" düğmesine dokunarak salt okunur konuşma görünümünü kaydırarak açın ve telefonda tam konuşma geçmişine göz atın

### Log yönetimi

Sol üst köşedeki CC-Viewer açılır menüsü aracılığıyla:

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**Log sıkıştırma**
Loglar konusunda yazar şunu belirtmek ister: Anthropic'in resmi tanımları değiştirilmemiştir; bu, logların bütünlüğünü garanti eder.
Ancak, 1M opus'un geç aşamalarda ürettiği tek bir log girdisi çok büyük olabildiğinden, MainAgent için uygulanan bazı log optimizasyonları sayesinde gzip olmadan bile boyut en az %66 oranında azaltılabilir.
Bu sıkıştırılmış logların ayrıştırma yöntemi mevcut depodan çıkarılabilir.

### Daha fazla pratik ve faydalı özellik

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

Kenar çubuğu araçlarıyla prompt'larınızı hızlıca bulabilirsiniz

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

İlginç bir özellik olan KV-Cache-Text, Claude'un ne gördüğünü tam olarak görmenize yardımcı olur

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

Resim yükleyip ihtiyaçlarınızı anlatabilirsiniz; Claude'un görüntüleri anlama yeteneği çok güçlüdür. Ayrıca biliyorsunuz, ekran görüntüsünü doğrudan Ctrl + V ile yapıştırabilirsiniz ve içeriğin tamamı konuşmada görüntülenir

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

Eklentileri doğrudan özelleştirebilir, cc-viewer'ın tüm süreçlerini yönetebilirsiniz; cc-viewer ayrıca üçüncü taraf arayüzler için sıcak geçiş yeteneğine sahiptir (evet, GLM, Kimi, MiniMax, Qwen, DeepSeek kullanabilirsiniz, ancak yazar şu anda hepsinin oldukça zayıf olduğunu düşünüyor)

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

Keşfetmenizi bekleyen daha fazla özellik var... Örneğin: bu sistem Agent Team'i destekler ve yerleşik bir Code Reviewer içerir. Yakında Codex Code Reviewer entegrasyonu da gelecek (yazar, Claude Code için kod review'ında Codex kullanmayı şiddetle tavsiye ediyor)

## License

MIT
