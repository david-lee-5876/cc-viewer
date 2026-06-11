# CC-Viewer

Claude Code üzerine inşa edilmiş, kendi geliştirme deneyiminden damıtılmış bir Vibe Coding aracı:

1. Yetenek tavanını yükseltir — /ultraPlan ve /ultraReview komutlarını yerel olarak çalıştırırken proje kodunuzun Claude bulutuna tamamen ifşa olmasını engeller;
2. Çoklu cihaz uyumu — mobil cihazlarda programlama (yerel ağ üzerinden), web sürümü çeşitli senaryolara uyum sağlar, tarayıcı eklentilerine veya işletim sistemi bölünmüş ekranına kolayca gömülebilir ve native kurulum paketi de sunulur;
3. Eksiksiz log saklama — Claude Code'un tam payload'unu yakalama ve analiz etme yeteneği sağlar; loglama, sorun analizi, öğrenme ve tersine mühendislik için idealdir;
4. Öğrenme deneyimi paylaşımı — birçok öğrenme materyali ve geliştirme deneyimi biriktirilmiştir (sistemin çeşitli yerlerindeki "?" simgelerine bakın);
5. Native deneyimi korur — yalnızca Claude Code'un yeteneklerini geliştirir, çekirdekte herhangi bir önemli değişiklik yapmaz, native deneyimi korur;
6. Üçüncü taraf model uyumu — deepseek-v4-\*, GLM 5.1, Kimi K2.6 ile uyumludur; yerleşik cc-switch yeteneği ile üçüncü taraf araçlar arasında istediğiniz zaman sıcak geçiş yapabilirsiniz;

<img width="860" alt="cc-viewer — deploy once, share with every device" src="https://raw.githubusercontent.com/weiesky/cc-viewer/main/docs/cc-viewer-share.svg" />

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

<a href="https://www.star-history.com/?repos=weiesky%2Fcc-viewer&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&theme=dark&legend=top-left" />

    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left" />

    ![Star History Chart](https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left)
  </picture>
</a>

## License

MIT
